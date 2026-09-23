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
export async function probeIds(ids,hash=null,count=256) {
  hash ??= await stateHash(ids);
  const rng=new PCG64(BigInt('0x'+hash.slice(0,16))),inside=Math.min(ids.length,Math.floor(count/2));
  return [...new Set([...rng.choice(ids.length,inside).map(i=>ids[i]),...rng.choice(N,count-inside)])].sort((a,b)=>a-b);
}
const entropy = values => {let h=0;for(const p of values)if(p>0)h-=p*Math.log(p);return h;};
const quantile = (a,q) => {const x=(a.length-1)*q,lo=Math.floor(x);return a[lo]+(a[Math.ceil(x)]-a[lo])*(x-lo);};

// NumPy's pairwise sum order matters when two probe scores nearly tie.
function numpySum(values,start=0,n=values.length) {
  if(n<8){let sum=-0;for(let i=0;i<n;i++)sum+=values[start+i];return sum;}
  if(n<=128){
    const r=values.slice(start,start+8);let i=8;
    for(;i<n-(n%8);i+=8)for(let k=0;k<8;k++)r[k]+=values[start+i+k];
    let sum=((r[0]+r[1])+(r[2]+r[3]))+((r[4]+r[5])+(r[6]+r[7]));
    for(;i<n;i++)sum+=values[start+i];return sum;
  }
  let half=Math.floor(n/2);half-=half%8;
  return numpySum(values,start,half)+numpySum(values,start+half,n-half);
}

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
  const stats=[[],[],[],[]],records=[];
  for(const g of await probeIds(ids,hash)) {
    const counts=new Uint32Array(36);for(const id of ids)counts[feedback(g,id)]++;
    const frequency=Array.from(counts,c=>c/n),nonwin=Array.from(counts,(c,a)=>a===WIN?0:c);
    const maximum=Math.max(...nonwin),squares=numpySum(frequency.map(p=>p*p));
    const h=-numpySum(frequency.map(p=>p>0?p*Math.log(p):0))/Math.log(20);
    const nonempty=counts.filter(c=>c>0).length;
    const childLower=nonwin.map(c=>c===0?0:lower(c));
    const weightedLower=nonwin.reduce((s,c,i)=>s+c*childLower[i],0)/n/7;
    stats[0].push(maximum/n);stats[1].push(squares);stats[2].push(h);stats[3].push(nonempty/20);
    records.push({g,counts,nonwin,maximum,squares,h,weightedLower,maxChildLower:Math.max(...childLower)});
  }
  for(const values of stats) {
    const sorted=values.slice().sort((a,b)=>a-b);
    result.push(...[0,.1,.25,.5,.75,.9,1].map(q=>quantile(sorted,q)),numpySum(values)/values.length);
  }
  const criteria=[r=>[r.maximum,r.squares,r.g],r=>[r.squares,r.maximum,r.g],
    r=>[-r.h,r.maximum,r.g],r=>[r.maxChildLower,r.weightedLower,r.squares,r.g]];
  for(const criterion of criteria) {
    let best=records[0],bestKey=criterion(best);
    for(const r of records.slice(1)) {
      const key=criterion(r);let comparison=0;
      for(let i=0;i<key.length;i++)if(key[i]!==bestKey[i]){comparison=key[i]<bestKey[i]?-1:1;break;}
      if(comparison<0){best=r;bestKey=key;}
    }
    result.push(...best.nonwin.slice().sort((a,b)=>b-a).slice(0,6).map(c=>c/n),best.counts[WIN]/n,best.weightedLower);
  }
  if(result.length!==192||result.some(x=>!Number.isFinite(x)))throw new Error('Invalid V2 features');
  return Float32Array.from(result);
}

export const MODEL_FORMAT = 'guess5-adaptive-estimator-v2';

function normalize(probabilities) {
  const total=probabilities.reduce((a,b)=>a+b,0);
  if(!(total>0)||!Number.isFinite(total))throw new Error('Invalid model probabilities');
  return probabilities.map(p=>p/total);
}

// Same finite candidate-set identities as predict/v2/certified_rules.py.
export function certifiedBounds(ids,probeUpper,rules) {
  const n=ids.length;
  let lo=lower(n),hi=Math.min(probeUpper??7,n,7),why=[];
  if(n<=2)return {lower:n,upper:n,rules:['analytic_size']};
  if(n===N)return {lower:rules.universe_value,upper:rules.universe_value,rules:['universe_exact7_from_forced_0r0s_and_verified_upper7']};
  if(ids.every(id=>masks[id]===masks[ids[0]])) {
    lo=Math.max(lo,rules.known_five_digit_capacity.findIndex(cap=>cap>=n));
    hi=Math.min(hi,rules.known_five_digit_upper);
    why.push('known_five_digit_alphabet_capacity');
    if(n===120)return {lower:rules.complete_120_permutations_value,upper:rules.complete_120_permutations_value,rules:[...why,'complete_permutations_exact6']};
    const motif=rules.same_alphabet_motifs.find(([size])=>size===n);
    if(motif) {
      for(let g=0;g<N;g++)if(masks[g]===masks[ids[0]]&&ids.every(id=>feedback(g,id)===motif[1]))
        return {lower:motif[2],upper:motif[2],rules:[...why,'complete_fixed_match_motif']};
    }
  }
  const motif=rules.modal_guess_motifs.find(([size])=>size===n);
  if(motif) {
    let code='';
    for(let p=0;p<5;p++) {
      const counts=new Uint32Array(10);for(const id of ids)counts[digits[id*5+p]]++;
      let best=0;for(let d=1;d<10;d++)if(counts[d]>counts[best])best=d;
      code+=best;
    }
    const g=codeIds.get(code);
    if(g!==undefined&&ids.every(id=>feedback(g,id)===motif[1]))
      return {lower:motif[2],upper:motif[2],rules:[...why,'complete_fixed_position_motif']};
  }
  if(lo>hi)throw new Error('Inconsistent difficulty bounds');
  return {lower:lo,upper:hi,rules:why};
}

export class Predictor {
  constructor(model) {
    if(model.format!==MODEL_FORMAT||model.probe_count!==256||model.configuration?.features!==192||
       model.configuration.feature!=='X192_256'||model.members?.length!==3||
       model.configuration.symmetry_average!==1||model.raw_feature_permutations_after_identity?.length!==0||
       !model.certified_rules||!(model.configuration.temperature>0))throw new Error('Incompatible V2 model');
    for(const m of model.members) {
      if(JSON.stringify(m.architecture)!=='[192,64,32,7]'||m.mean?.length!==192||m.scale?.length!==192||
         m.mean.some(x=>!Number.isFinite(x))||m.scale.some(x=>!Number.isFinite(x)||x<=0))throw new Error('Invalid V2 member');
      for(let k=0;k<3;k++) {
        const w=m.parameters['W'+k],b=m.parameters['b'+k];
        if(w?.length!==m.architecture[k]||b?.length!==m.architecture[k+1]||
           b.some(x=>!Number.isFinite(x))||w.some(row=>row.length!==b.length||row.some(x=>!Number.isFinite(x))))
          throw new Error('Invalid V2 weights');
      }
    }
    this.model=model;this.cache=new Map();
  }
  fromFeatures(raw,n) {
    if(raw.length!==192||Array.from(raw).some(x=>!Number.isFinite(x)))throw new Error('Invalid V2 features');
    const total=Array(7).fill(0);
    for(const m of this.model.members) {
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
      normalize(logits.map(x=>Math.exp(x-mx))).forEach((p,i)=>total[i]+=p/this.model.members.length);
    }
    const probabilities=normalize(total.map(x=>Math.pow(x,1/this.model.configuration.temperature)));
    return {probabilities,estimate:probabilities.reduce((s,p,i)=>s+p*(i+1),0)};
  }
  async evaluate(input,{guard=true}={}) {
    const ordered=Array.from(input).sort((a,b)=>a-b),n=ordered.length;
    if(!n||ordered.some((id,i)=>!Number.isInteger(id)||id<0||id>=N||(i>0&&ordered[i-1]===id)))
      throw new Error('Expected a nonempty set of distinct candidate IDs');
    if(n<=2)return {estimate:n,probabilities:Array.from({length:7},(_,i)=>Number(i+1===n)),lower:n,upper:n,rules:['analytic_size']};
    const ids=Uint16Array.from(ordered),hash=await stateHash(ids),key=(guard?'guard:':'raw:')+hash;
    if(this.cache.has(key))return this.cache.get(key);
    const raw=await features(ids,hash),prediction=this.fromFeatures(raw,n);
    const probeUpper=Math.round(raw[128]*n)<=1?2:Math.min(n,7);
    const bound=guard?certifiedBounds(ids,probeUpper,this.model.certified_rules):{lower:lower(n),upper:Math.min(n,7),rules:[]};
    let probabilities=prediction.probabilities;
    if(guard) {
      probabilities=probabilities.map((p,i)=>i+1>=bound.lower&&i+1<=bound.upper?p:0);
      if(probabilities.every(p=>p===0))probabilities=probabilities.map((_,i)=>Number(i+1>=bound.lower&&i+1<=bound.upper));
      probabilities=normalize(probabilities);
    }
    const result={...bound,probabilities,estimate:probabilities.reduce((s,p,i)=>s+p*(i+1),0)};
    if(this.cache.size>=512)this.cache.delete(this.cache.keys().next().value);
    this.cache.set(key,result);return result;
  }
  async estimate(ids) { return (await this.evaluate(ids)).estimate; }
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
