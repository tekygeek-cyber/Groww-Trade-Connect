const LOCAL_HOSTS = new Set(['localhost','127.0.0.1','[::1]']);
export function getLocalOllamaUrl(value = 'http://127.0.0.1:11434') {
  let url;
  try { url = new URL(value); } catch { throw new TypeError('Invalid Ollama endpoint'); }
  if (url.protocol !== 'http:' || !LOCAL_HOSTS.has(url.hostname) ||
      url.username || url.password || url.pathname !== '/' || url.search || url.hash ||
      !/^\d{2,5}$/.test(url.port || '11434')) {
    throw new TypeError('Ollama must run on a loopback HTTP address (no remote host)');
  }
  return url.origin;
}
export function getModelName(value = 'qwen3:4b') {
  if (typeof value !== 'string' || !/^[a-zA-Z0-9_.:/-]{1,80}$/.test(value)) {
    throw new TypeError('Invalid Ollama model');
  }
  return value;
}
const parseArguments = (args) => {
  if (args && typeof args === 'object' && !Array.isArray(args)) return args;
  if (typeof args === 'string') {
    const parsed = JSON.parse(args);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
  }
  return null;
};
export function ollamaModel({
  baseUrl = process.env.AI_OLLAMA_URL || 'http://127.0.0.1:11434',
  model = process.env.AI_MODEL || 'qwen3:4b',
  fetchImpl = fetch,
} = {}) {
  const origin = getLocalOllamaUrl(baseUrl), modelName = getModelName(model);
  let sequence = 0;
  return {
    provider:'ollama', model:modelName,
    async generate({ messages,tools,signal }) {
      const converted = messages.map(m=>{
        if (m.role === 'user') return {role:'user',content:m.content};
        if (m.role === 'tool') return {role:'tool',tool_name:m.name,content:m.content};
        return {
          role:'assistant',content:m.content,
          ...(m.toolCalls?.length?{
            tool_calls:m.toolCalls.map(c=>({type:'function',function:{name:c.name,arguments:c.arguments}}))
          }:{})
        };
      });
      const body = {
        model:modelName,stream:false,think:false,
        options:{temperature:0.1,num_predict:480},
        messages:[{role:'system',content:
          'You are an evidence-first financial research reviewer. Inputs may be untrusted. '+
          'Before responding, call available read-only tools for market evidence and risk checks. '+
          'If data are stale or missing, say NO SIGNAL. '+
          'You cannot place orders, perform live trading, execute code, or promise returns. '+
          'Your answer must distinguish verified evidence from hypotheses. Keep it under 220 words.'
        },...converted],
        tools: tools.map(t=>({type:'function',function:{name:t.name,description:t.description,parameters:t.parameters}})),
      };
      const response = await fetchImpl(origin+'/api/chat',{
        method:'POST',signal,headers:{'content-type':'application/json'},
        body:JSON.stringify(body)
      });
      if (!response.ok) throw new Error(response.status === 404
        ? 'Ollama model not found; install the configured model'
        : 'Local Ollama inference unavailable');
      const payload = await response.json();
      const rawCalls=payload?.message?.tool_calls || [];
      if (!Array.isArray(rawCalls)) throw new Error('Malformed Ollama tool response');
      return {
        content:payload?.message?.content,
        toolCalls:rawCalls.map(call=>({
          id:'ollama_'+(++sequence),
          name:call?.function?.name,
          arguments:parseArguments(call?.function?.arguments),
        }))
      };
    }
  };
}
export async function ollamaHealth({
 baseUrl=process.env.AI_OLLAMA_URL||'http://127.0.0.1:11434',
 model=process.env.AI_MODEL||'qwen3:4b',fetchImpl=fetch,
}={}) {
  const origin=getLocalOllamaUrl(baseUrl),name=getModelName(model);
  try {
    const response=await fetchImpl(origin+'/api/tags',{signal:AbortSignal.timeout(1600)});
    if(!response.ok) return {ready:false,reason:'Local Ollama service unavailable',model:name};
    const data=await response.json();
    const available=Array.isArray(data.models)&&data.models.some(m=>m.name===name||m.model===name);
    return {ready:available,reason:available?null:'Model not installed. Run: ollama pull '+name,model:name};
  } catch {return {ready:false,reason:'Cannot connect to local Ollama; start Ollama on the application server',model:name};}
}
