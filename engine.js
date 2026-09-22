import { PCG64 } from './numpy-random.js';

export const N = 30240, WIN = 35;
export const LEVELS = [-2, -1, 0, 1, 2, 4];
export const codes = [], digits = new Uint8Array(N*5), masks = new Uint16Array(N);
export const popcount = Uint8Array.from({length:1024}, (_, i) => {
  let n=0; while(i) {i&=i-1; n++;} return n;
});
const pairs=[], positionPairs=[];
for(let a=0;a<10;a++) for(let b=a+1;b<10;b++) pairs.push([a,b]);
for(let a=0;a<5;a++) for(let b=a+1;b<5;b++) positionPairs.push([a,b]);
function enumerate(prefix, mask) {
  if(prefix.length===5) {
    const id=codes.length; codes.push(prefix.join('')); digits.set(prefix,id*5); masks[id]=mask; return;
  }
  for(let d=0;d<10;d++) if(!(mask&(1<<d))) enumerate([...prefix,d],mask|(1<<d));
}
enumerate([],0);
const codeIds = new Map(codes.map((c,i)=>[c,i]));
export const isValidGuess = s => typeof s==='string' && /^[0-9]{5}$/.test(s) && new Set(s).size===5;
export const allIds = () => Uint16Array.from({length:N},(_,i)=>i);
export function lower(n) { let cap=0; for(let k=1;k<=7;k++){cap=1+19*cap;if(n<=cap)return k;} throw new Error('Invalid state'); }
export function feedback(g,s) {
  let r=0;for(let p=0;p<5;p++)r+=digits[g*5+p]===digits[s*5+p];
  return r*6+popcount[masks[g]&masks[s]];
}
export function partition(ids,g) {
  const buckets=Array.from({length:36},()=>[]);
  for(const id of ids)buckets[feedback(g,id)].push(id);
  return buckets.map((ids,answer)=>({answer,ids:Uint16Array.from(ids)})).filter(b=>b.ids.length);
}
export async function stateHash(ids) {
  const bytes=new Uint8Array(N/8);for(const id of ids)bytes[id>>3]|=1<<(id&7);
  const digest=new Uint8Array(await crypto.subtle.digest('SHA-256',bytes));
  return Array.from(digest,x=>x.toString(16).padStart(2,'0')).join('');
}
export async function probeIds(ids,hash=null) {
  hash ??= await stateHash(ids);
  const rng=new PCG64(BigInt('0x'+hash.slice(0,16))),inside=Math.min(ids.length,32);
  return [...new Set([...rng.choice(ids.length,inside).map(i=>ids[i]),...rng.choice(N,64-inside)])].sort((a,b)=>a-b);
}
const entropy = values => {let h=0;for(const p of values)if(p>0)h-=p*Math.log(p);return h;};
const quantile = (a,q) => {const x=(a.length-1)*q,lo=Math.floor(x);return a[lo]+(a[Math.ceil(x)]-a[lo])*(x-lo);};

export async function features(ids,hash=null) {
  const n=ids.length;if(!n)throw new Error('Empty candidate set');
  const pc=new Float64Array(50),cc=new Float64Array(100),mc=new Float64Array(1024);
  const joint=Array.from({length:10},()=>new Float64Array(100));
  for(const id of ids) {
    const off=id*5;mc[masks[id]]++;
    for(let p=0;p<5;p++) {
      const d=digits[off+p];pc[p*10+d]++;cc[d*10+d]++;
      for(let q=p+1;q<5;q++){const e=digits[off+q];cc[d*10+e]++;cc[e*10+d]++;}
    }
    positionPairs.forEach(([a,b],i)=>joint[i][digits[off+a]*10+digits[off+b]]++);
  }
  const probs=Float64Array.from(pc,x=>x/n),mp=Array.from(mc).filter(x=>x>0).map(x=>x/n);
  let union=0,intersection=0;for(let d=0;d<10;d++){if(cc[d*10+d])union++;if(cc[d*10+d]===n)intersection++;}
  const result=[Math.log1p(n)/Math.log1p(N),1/n,lower(n)/7,union/10,intersection/5,mp.length/252,entropy(mp)/Math.log(252),Math.max(...mp),...probs];
  for(let p=0;p<5;p++)result.push(entropy(probs.slice(p*10,p*10+10))/Math.log(10));
  for(let p=0;p<5;p++)result.push(pc.slice(p*10,p*10+10).filter(x=>x>0).length/10);
  for(let p=0;p<5;p++)result.push(Math.max(...probs.slice(p*10,p*10+10)));
  for(const [a,b] of pairs)result.push(cc[a*10+b]/n);
  positionPairs.forEach(([a,b],i)=>{
    let value=0;
    for(let da=0;da<10;da++)for(let db=0;db<10;db++) {
      const p=joint[i][da*10+db]/n;
      if(p)value+=p*Math.log(p/(probs[a*10+da]*probs[b*10+db]));
    }
    result.push(value/Math.log(10));
  });
  const stats=[[],[],[],[]];
  for(const g of await probeIds(ids,hash)) {
    const counts=new Uint32Array(36);for(const id of ids)counts[feedback(g,id)]++;
    let maximum=0,concentration=0,h=0,nonempty=0;
    for(let a=0;a<36;a++) {
      const c=counts[a];if(a!==WIN)maximum=Math.max(maximum,c);
      if(c){const p=c/n;concentration+=p*p;h-=p*Math.log(p);nonempty++;}
    }
    stats[0].push(maximum/n);stats[1].push(concentration);stats[2].push(h/Math.log(20));stats[3].push(nonempty/20);
  }
  for(const values of stats) {
    values.sort((a,b)=>a-b);
    result.push(...[0,.1,.25,.5,.75,.9,1].map(q=>quantile(values,q)),values.reduce((a,b)=>a+b,0)/values.length);
  }
  if(result.length!==160 || result.some(x=>!Number.isFinite(x)))throw new Error('Invalid features');
  return Float32Array.from(result);
}

export class Predictor {
  constructor(model) {
    if(JSON.stringify(model.architecture)!=='[160,64,32,7]')throw new Error('Incompatible model');
    this.model=model;this.cache=new Map();
  }
  fromFeatures(raw,n) {
    const m=this.model;
    let a=Float32Array.from(raw,(x,i)=>Math.fround(Math.fround(x-m.mean[i])/m.scale[i]));
    for(let layer=0;layer<3;layer++) {
      const w=m.parameters['W'+layer],b=m.parameters['b'+layer],out=new Float32Array(b.length);
      for(let j=0;j<b.length;j++) {
        let sum=b[j];for(let i=0;i<a.length;i++)sum+=a[i]*w[i][j];
        out[j]=layer<2?Math.max(sum,0):sum;
      }
      a=out;
    }
    const lo=lower(n),hi=Math.min(n,7);
    const logits=Array.from(a,(x,i)=>i+1>=lo&&i+1<=hi?x:-Infinity),mx=Math.max(...logits);
    const p=logits.map(x=>Math.exp(x-mx)),total=p.reduce((a,b)=>a+b,0);
    return {probabilities:p.map(x=>x/total),estimate:p.reduce((s,x,i)=>s+x*(i+1),0)/total};
  }
  async estimate(ids) {
    if(ids.length<=2)return ids.length;
    const hash=await stateHash(ids);
    if(this.cache.has(hash))return this.cache.get(hash);
    const h=this.fromFeatures(await features(ids,hash),ids.length).estimate;
    if(this.cache.size>=512)this.cache.delete(this.cache.keys().next().value);
    this.cache.set(hash,h);return h;
  }
}

export function answerProbabilities(counts,values,lambda) {
  const logits=counts.map((n,i)=>Math.log(n)+Math.LN2*lambda*values[i]),max=Math.max(...logits);
  const w=logits.map(x=>Math.exp(x-max)),total=w.reduce((a,b)=>a+b,0);
  return w.map(x=>x/total);
}
export function secureUniform() {
  const a=crypto.getRandomValues(new Uint32Array(2));
  return ((a[0]>>>5)*67108864+(a[1]>>>6))/9007199254740992;
}
export class AdaptiveGame {
  constructor(predictor,lambda,random=secureUniform) {
    if(!LEVELS.includes(lambda))throw new Error('Invalid difficulty');
    this.predictor=predictor;this.lambda=lambda;this.random=random;this.ids=allIds();this.over=false;
  }
  async guess(text) {
    if(this.over)throw new Error('Game already finished');
    if(!isValidGuess(text))throw new Error('Invalid guess');
    const g=codeIds.get(text),buckets=partition(this.ids,g),counts=buckets.map(b=>b.ids.length);
    let probabilities;
    if(this.lambda===0 || buckets.length===1)probabilities=counts.map(n=>n/this.ids.length);
    else {
      const values=[];
      for(const b of buckets)values.push(b.answer===WIN?0:await this.predictor.estimate(b.ids));
      probabilities=answerProbabilities(counts,values,this.lambda);
    }
    const random=this.random();if(!(random>=0&&random<1))throw new Error('Invalid random sample');
    let cumulative=0,index=buckets.length-1;
    for(let i=0;i<buckets.length;i++){cumulative+=probabilities[i];if(random<cumulative){index=i;break;}}
    const selected=buckets[index];this.ids=selected.ids;this.over=selected.answer===WIN;
    return {r:Math.floor(selected.answer/6),s:selected.answer%6,won:this.over};
  }
  reveal() {
    if(this.over)throw new Error('Game already finished');
    this.over=true;return codes[this.ids[Math.floor(this.random()*this.ids.length)]];
  }
}
