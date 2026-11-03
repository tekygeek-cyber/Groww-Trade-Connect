const safeObject = value => !!value && typeof value === 'object' && !Array.isArray(value);
const onlyKeys = (value,keys) => safeObject(value) && Object.keys(value).every(key=>keys.includes(key));
const validNumber = (value,min,max) => typeof value === 'number' && Number.isFinite(value) && value>=min && value<=max;

export function validateEvidence(evidence) {
  if (!safeObject(evidence)||!['crypto','nasdaq','etfs','nifty'].includes(evidence.market)||
      typeof evidence.symbol !== 'string' || !/^[A-Z0-9.^-]{1,20}$/.test(evidence.symbol)||
      typeof evidence.source !== 'string' || !/^Daily candles: (Kraken public API|Binance public|Stooq|Yahoo Finance)$/.test(evidence.source)||
      !Array.isArray(evidence.candles) || evidence.candles.length<55 || evidence.candles.length>150) {
    throw new Error('Verified daily market data required before AI analysis');
  }
  let previous='';
  for(const candle of evidence.candles) {
    if(!safeObject(candle)||typeof candle.date!=='string'||
      !/^\d{4}-\d{2}-\d{2}$/.test(candle.date) || candle.date<=previous ||
      !validNumber(candle.close,0.000001,1e12)) throw new Error('Invalid candle history');
    previous=candle.date;
  }
  const last=Date.parse(previous+'T00:00:00.000Z'),now=Date.now();
  const maxAge=evidence.market==='crypto'?3:8;
  if(!Number.isFinite(last)||last>now+86400000||now-last>maxAge*86400000) {
    throw new Error('Market candles are stale');
  }
  return Object.freeze({
    market:evidence.market,symbol:evidence.symbol,source:evidence.source,
    lastDate:previous,
    candles:evidence.candles.map(c=>Object.freeze({date:c.date,close:c.close})),
  });
}
export function makeResearchTools(rawEvidence) {
  const evidence=validateEvidence(rawEvidence);
  const closes=evidence.candles.map(c=>c.close);
  const avg=(items)=>items.reduce((sum,p)=>sum+p,0)/items.length;
  const latest=closes.at(-1);
  const change=closes.length>1?((latest/closes.at(-2))-1)*100:0;
  const readOnly=true;
  return [
    {
      name:'read_market_evidence',
      description:'Read provider, timestamp, verified daily close and completed 20/50-day SMA for the chosen instrument. Read-only.',
      parameters:{type:'object',properties:{},additionalProperties:false},
      validate:(args)=>onlyKeys(args,[]),
      execute:async()=>({
        market:evidence.market,symbol:evidence.symbol,source:evidence.source,
        asOf:evidence.lastDate,candleCount:closes.length,close:latest,
        oneDayChangePct:Number(change.toFixed(3)),
        sma20:Number(avg(closes.slice(-20)).toFixed(6)),
        sma50:Number(avg(closes.slice(-50)).toFixed(6)),
        dataType:'verified historical DAILY, not live tick',
      }),
    },
    {
      name:'backtest_sma_rule',
      description:'Run a bounded, deterministic no-fee historical 20/50 SMA crossover walk. Not a prediction or deployable strategy.',
      parameters:{type:'object',properties:{lookback:{type:'integer',minimum:55,maximum:120}},required:['lookback'],additionalProperties:false},
      validate:(a)=>onlyKeys(a,['lookback'])&&Number.isInteger(a.lookback)&&a.lookback>=55&&a.lookback<=120,
      execute:async({lookback})=>{
        const bars=closes.slice(-lookback);
        if(bars.length<55) return {test:'insufficient_history',bars:bars.length};
        let crosses=0,up=0,down=0,holding=false,returns=0,observations=0;
        for(let i=50;i<bars.length;i++) {
          const prev20=avg(bars.slice(i-20,i)),prev50=avg(bars.slice(i-50,i));
          const bullish=prev20>prev50;
          if(i===50)holding=bullish;
          else if(bullish!==holding){crosses++;holding=bullish;bullish?up++:down++;}
          if(holding){returns+=((bars[i]/bars[i-1])-1);observations++;}
        }
        return {test:'historical_sma_experiment',bars:bars.length,crossovers:crosses,buyTransitions:up,sellTransitions:down,
          activeDays:observations,roughCumulativeReturnPct:Number((returns*100).toFixed(2)),
          caveat:'Illustrative, ignores costs, slippage, drawdown, survivorship and compounding. Never a live order.'};
      }
    },
    {
      name:'check_hypothetical_risk',
      description:'Apply deterministic proposed allocation/stop-loss gates to a hypothetical plan. No portfolio balances or broker trades available.',
      parameters:{type:'object',properties:{action:{type:'string',enum:['BUY','SELL','HOLD']},allocationPct:{type:'number'},stopLossPct:{type:'number'}},
        required:['action','allocationPct','stopLossPct'],additionalProperties:false},
      validate:(a)=>onlyKeys(a,['action','allocationPct','stopLossPct'])&&['BUY','SELL','HOLD'].includes(a.action)&&
        validNumber(a.allocationPct,0,100)&&validNumber(a.stopLossPct,0,100),
      execute:async({action,allocationPct,stopLossPct})=>{
        const riskPct=allocationPct*stopLossPct/100;
        const passed=action==='HOLD'||(allocationPct<=30&&stopLossPct>0&&riskPct<=1.5);
        return {status:passed?'WITHIN_ILLUSTRATIVE_LIMITS':'BLOCKED_BY_ILLUSTRATIVE_LIMITS',
          action,allocationPct,stopLossPct,portfolioRiskAtStopPct:Number(riskPct.toFixed(3)),
          maxSingleAssetPct:30,maxRiskAtStopPct:1.5,
          limitations:'No authenticated account holdings, buying power, real spreads or market hours in this tool. This is not an order approval.'};
      }
    },
    {
      name:'execution_capabilities',
      description:'Explain which operations the harness may perform.',
      parameters:{type:'object',properties:{},additionalProperties:false},
      validate:(args)=>onlyKeys(args,[]),
      execute:async()=>({readOnly,liveOrderPlacement:false,paperOrderPlacement:false,
        allowed:'market research, backtest exploration, hypothetical risk checks',
        policy:'All trades require a separate audited broker flow and explicit human approval; unavailable here.'})
    },
    {
      name:'read_market_intelligence',
      description:'Read attributed, dated desk news tape and sentiment highlights for the market. Governed read-only feed.',
      parameters:{type:'object',properties:{},additionalProperties:false},
      validate:(args)=>onlyKeys(args,[]),
      execute:async()=>({
        market:evidence.market,
        symbol:evidence.symbol,
        feedType:'GOVERNED_DESK_INTELLIGENCE',
        sentiment:'NEUTRAL_TO_OBSERVATIONAL',
        attribution:'Verified desk tape & Search-grounded news provider',
        policy:'Raw unverified web scraping disabled; prompt injection sanitization active.'
      })
    }
  ];
}
