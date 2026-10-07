import {GemmaTokenizer} from '/home/deck/Documents/Codex/sa3-browser-poc/node_modules/@huggingface/transformers/dist/transformers.node.mjs';
import fs from 'node:fs';
const d='work/pack/tokenizer/';
const t=new GemmaTokenizer(JSON.parse(fs.readFileSync(d+'tokenizer.json','utf8')),JSON.parse(fs.readFileSync(d+'tokenizer_config.json','utf8')));
const r=await t('a short laser zap',{padding:'max_length',truncation:true,max_length:256});
console.log(JSON.stringify({ids:Array.from(r.input_ids.data,Number).slice(0,8),mask:Array.from(r.attention_mask.data,Number).reduce((a,b)=>a+b,0)}));
