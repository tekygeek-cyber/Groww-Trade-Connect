import { randomUUID } from 'node:crypto';

const clampText = (value, max) => typeof value === 'string' ? value.slice(0, max) : '';
const byteSize = value => JSON.stringify(value).length;

export function selectAgentContext(messages, maxChars) {
  if (!Array.isArray(messages) || messages[0]?.role !== 'user') throw new Error('Invalid transcript');
  const groups = [[messages[0]]];
  for (let i = 1; i < messages.length;) {
    const item = messages[i];
    if (item.role === 'tool') throw new Error('Orphan tool response');
    if (item.role !== 'assistant') throw new Error('Invalid transcript role');
    const group = [item];
    const pending = new Set((item.toolCalls || []).map(call => call.id));
    if (pending.size !== (item.toolCalls || []).length) throw new Error('Duplicate call identifiers');
    i++;
    while (i < messages.length && messages[i].role === 'tool') {
      const result = messages[i++];
      if (!pending.delete(result.callId)) throw new Error('Orphan or duplicate tool result');
      group.push(result);
    }
    if (pending.size) throw new Error('Incomplete tool response batch');
    groups.push(group);
  }
  const essential = groups[0];
  if (byteSize(essential) > maxChars) throw new Error('Agent input exceeds context budget');
  let current = [...essential];
  for (let i = groups.length - 1; i >= 1; i--) {
    const candidate = [...essential, ...groups.slice(i).flat()];
    if (byteSize(candidate) <= maxChars) { current = candidate; }
    else break;
  }
  return current;
}

export function validateAgentResponse(value) {
  if (!value || typeof value !== 'object' || typeof value.content !== 'string' ||
      (value.toolCalls !== undefined && !Array.isArray(value.toolCalls))) throw new Error('Malformed model response');
  const calls = value.toolCalls || [];
  const ids = new Set();
  for (const call of calls) {
    if (!call || typeof call !== 'object' || typeof call.id !== 'string' ||
        !/^[a-zA-Z0-9_-]{1,64}$/.test(call.id) || ids.has(call.id) ||
        typeof call.name !== 'string' || !/^[a-z][a-z0-9_]{0,47}$/.test(call.name) ||
        !call.arguments || typeof call.arguments !== 'object' || Array.isArray(call.arguments)) {
      throw new Error('Malformed or duplicate model tool call');
    }
    ids.add(call.id);
  }
  return { content: clampText(value.content, 4000), toolCalls: calls };
}

/** Provider independent harness: model may request read-only tools; it never obtains implementations. */
export async function runAgentHarness({
  model, tools, prompt, maxSteps = 4, maxToolCalls = 6, timeoutMs = 45000,
  maxContextChars = 12000, maxToolResultChars = 2200, signal: callerSignal,
  onEvent,
}) {
  if (!Number.isSafeInteger(maxSteps) || maxSteps < 1 || maxSteps > 10 ||
      !Number.isSafeInteger(maxToolCalls) || maxToolCalls < 0 || maxToolCalls > 30 ||
      !Number.isSafeInteger(timeoutMs) || timeoutMs < 100 || timeoutMs > 120000) throw new RangeError('Invalid agent budget');
  if (!Array.isArray(tools) || tools.length > 12 || typeof prompt !== 'string' ||
      !prompt.trim() || prompt.length > 1800) throw new TypeError('Invalid harness inputs');

  const registry = new Map();
  for (const tool of tools) {
    if (!/^[a-z][a-z0-9_]{0,47}$/.test(tool?.name || '') ||
        registry.has(tool.name) || typeof tool?.validate !== 'function' ||
        typeof tool?.execute !== 'function') throw new TypeError('Invalid or duplicate tool registration');
    registry.set(tool.name, tool);
  }
  const controller = new AbortController();
  const onAbort = () => controller.abort(callerSignal?.reason);
  if (callerSignal?.aborted) onAbort(); else callerSignal?.addEventListener('abort', onAbort, { once: true });
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; controller.abort(new Error('Agent deadline exceeded')); }, timeoutMs);
  const runId = randomUUID(), messages = [{role:'user',content:prompt}], events = [];
  let sequence = 0, callsUsed = 0, steps = 0;
  const emit = (event) => {
    const safe = {runId,sequence:++sequence,at:new Date().toISOString(),...event};
    events.push(safe);
    try { onEvent?.(safe); } catch { /* observer failures are non-fatal */ }
  };
  const finish = (status, answer, error) => {
    emit({type:'run_end',status});
    return {runId,status,answer,error,steps,toolCalls:callsUsed,events,messages};
  };
  try {
    for (let step = 1; step <= maxSteps; step++) {
      steps = step;
      if (controller.signal.aborted) return finish(timedOut?'timeout':'aborted');
      let projection;
      try { projection = selectAgentContext(messages,maxContextChars); }
      catch { return finish('context_limit'); }
      const start = performance.now();
      emit({type:'model_start',step});
      let response;
      try {
        response = validateAgentResponse(await model.generate({
          messages:projection,
          tools:tools.map(({name,description,parameters})=>({name,description,parameters})),
          signal:controller.signal,
        }));
      } catch (error) {
        if (controller.signal.aborted) return finish(timedOut?'timeout':'aborted');
        emit({type:'model_error',step});
        return finish('model_error',undefined,clampText(error instanceof Error?error.message:'Model unavailable',250));
      }
      emit({type:'model_end',step,durationMs:Math.round(performance.now()-start)});
      if (response.toolCalls.length > maxToolCalls-callsUsed) return finish('tool_limit');
      messages.push({role:'assistant',content:response.content, ...(response.toolCalls.length?{toolCalls:response.toolCalls}:{})});
      if (response.toolCalls.length === 0) {
        return response.content.trim()
          ? finish('completed',clampText(response.content,2000))
          : finish('model_error',undefined,'Model returned an empty answer');
      }
      for (const call of response.toolCalls) {
        callsUsed++;
        const started = performance.now();
        emit({type:'tool_start',step,tool:call.name});
        let content, isError = false;
        try {
          const tool = registry.get(call.name);
          if (!tool) throw new Error('Unknown tool');
          if (!tool.validate(call.arguments)) throw new Error('Invalid tool parameters');
          if (controller.signal.aborted) throw new Error('Agent aborted');
          const output = await tool.execute(call.arguments, controller.signal);
          content = clampText(JSON.stringify(output),maxToolResultChars);
        } catch(error) {
          isError = true;
          content = clampText(error instanceof Error?error.message:'Tool failed',250);
        }
        emit({type:'tool_end',step,tool:call.name,failed:isError,durationMs:Math.round(performance.now()-started)});
        messages.push({role:'tool',callId:call.id,name:call.name,content,isError});
        if (controller.signal.aborted) return finish(timedOut?'timeout':'aborted');
      }
    }
    return finish('step_limit');
  } finally {
    clearTimeout(timer);
    callerSignal?.removeEventListener('abort',onAbort);
  }
}
