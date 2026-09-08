import sharp from 'sharp';
import path from 'node:path';
import fs from 'node:fs/promises';
const root=path.resolve('content/homepage-tutorials/10-story-to-picture-book');
await Promise.all(['compare','steps'].map(dir=>fs.mkdir(path.join(root,dir),{recursive:true})));
const scenes=Array.from({length:6},(_,i)=>path.join(root,'results',`scene-${String(i+1).padStart(2,'0')}.png`));
await sharp(path.join(root,'source/character-card.png')).resize(1200,800,{fit:'inside'}).webp({quality:86}).toFile(path.join(root,'source/character-card.webp'));
for(let i=0;i<scenes.length;i++) await sharp(scenes[i]).resize(1200,800,{fit:'inside'}).webp({quality:86}).toFile(path.join(root,'results',`scene-${String(i+1).padStart(2,'0')}.webp`));
const thumbs=await Promise.all(scenes.map(file=>sharp(file).resize(520,347,{fit:'cover'}).webp({quality:82}).toBuffer()));
await sharp({create:{width:1560,height:694,channels:4,background:'#0b1620'}}).composite(thumbs.map((input,i)=>({input,left:(i%3)*520,top:Math.floor(i/3)*347}))).webp({quality:88}).toFile(path.join(root,'compare/story-sequence.webp'));
await sharp({create:{width:1200,height:900,channels:4,background:'#08131d'}}).composite([
  {input:await sharp(path.join(root,'source/character-card.png')).resize(430,420,{fit:'contain'}).toBuffer(),left:30,top:40},
  {input:await sharp(scenes[0]).resize(710,420,{fit:'cover'}).toBuffer(),left:460,top:40},
  {input:await sharp(scenes[4]).resize(570,380,{fit:'cover'}).toBuffer(),left:30,top:490},
  {input:await sharp(scenes[5]).resize(570,380,{fit:'cover'}).toBuffer(),left:600,top:490}
]).webp({quality:88}).toFile(path.join(root,'cover.webp'));
for(let i=0;i<7;i++){
 const src=path.join(root,'screens',`${String(i+1).padStart(2,'0')}-${['character-setting','character-result','character-reference','six-story-prompts','task-list','task-complete','six-results'][i]}.png`);
 await sharp(src).resize(1400,1000,{fit:'inside',withoutEnlargement:true}).webp({quality:82}).toFile(path.join(root,'steps',`step-${String(i+1).padStart(2,'0')}.webp`));
}
