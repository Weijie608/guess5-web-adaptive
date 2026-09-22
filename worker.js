import { AdaptiveGame, Predictor } from './engine.js';

const ready=fetch(new URL('./model.json',import.meta.url)).then(response=>{
  if(!response.ok)throw new Error('Unable to load difficulty model');
  return response.json();
}).then(model=>new Predictor(model));
let game=null,session=null,queue=Promise.resolve();
self.onmessage=event=>{
  const message=event.data;
  queue=queue.then(async()=>{
    try {
      const predictor=await ready;
      let result;
      if(message.type==='prepare') {
        result={};
      } else if(message.type==='start') {
        game=new AdaptiveGame(predictor,message.lambda);session=message.session;result={};
      } else {
        if(!game||message.session!==session)throw new Error('Stale game request');
        if(message.type==='guess')result=await game.guess(message.guess);
        else if(message.type==='reveal')result={secret:game.reveal()};
        else throw new Error('Unknown request');
      }
      self.postMessage({id:message.id,session:message.session,ok:true,result});
    } catch(error) {
      self.postMessage({id:message.id,session:message.session,ok:false,error:error.message});
    }
  });
};
