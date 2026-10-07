import type {Sample} from '@/types';

const encoder = new TextEncoder();
const crcTable = Uint32Array.from({length:256}, (_,value) => {
  let crc=value;
  for(let bit=0;bit<8;bit++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);
  return crc>>>0;
});
function crc32(bytes:Uint8Array):number {
  let crc=0xffffffff;
  for(const byte of bytes)crc=(crc>>>8)^crcTable[(crc^byte)&255];
  return (crc^0xffffffff)>>>0;
}

// Stored ZIP entries retain original BMP/TIFF bytes; no image re-encoding.
// A single download also avoids browsers blocking multiple automatic downloads.
export async function lensSnapshotArchive(
  sample:Sample,
  load:(channel:string)=>Promise<Blob>,
):Promise<Blob> {
  return imageSetArchive(Object.entries(sample.images).filter(([channel])=>['h','d','n','p'].includes(channel)).map(([channel,image])=>({channel,filename:image.filename,load:()=>load(channel)})));
}

export function localImageArchive(files:Partial<Record<string,File>>):Promise<Blob>{
  return imageSetArchive(Object.entries(files).filter((entry):entry is [string,File]=>!!entry[1]).map(([channel,file])=>({channel,filename:file.name,load:async()=>file})));
}

async function imageSetArchive(entries:{channel:string;filename:string;load:()=>Promise<Blob>}[]):Promise<Blob>{
  const parts:BlobPart[]=[];
  const directory:BlobPart[]=[];
  let offset=0, directoryBytes=0;
  if(!entries.length)throw new Error('This lens has no source images to download.');
  for(const {channel,filename,load} of entries){
    const name=encoder.encode(`${channel}/${filename.split(/[\\/]/).pop() || `image.${channel}`}`);
    const file=await load();
    if(file.size>0xffffffff||offset+file.size+name.length+30>0xffffffff)throw new Error('Snapshot exceeds the ZIP size limit.');
    const crc=crc32(new Uint8Array(await file.arrayBuffer()));
    const header=new Uint8Array(30),h=new DataView(header.buffer);
    h.setUint32(0,0x04034b50,true);h.setUint16(4,20,true);h.setUint16(6,0x0800,true);
    h.setUint16(12,0x21,true);h.setUint32(14,crc,true);h.setUint32(18,file.size,true);h.setUint32(22,file.size,true);h.setUint16(26,name.length,true);
    const central=new Uint8Array(46),c=new DataView(central.buffer);
    c.setUint32(0,0x02014b50,true);c.setUint16(4,20,true);c.setUint16(6,20,true);c.setUint16(8,0x0800,true);
    c.setUint16(14,0x21,true);c.setUint32(16,crc,true);c.setUint32(20,file.size,true);c.setUint32(24,file.size,true);c.setUint16(28,name.length,true);c.setUint32(42,offset,true);
    parts.push(header,name,file);directory.push(central,name);
    offset+=header.length+name.length+file.size;directoryBytes+=central.length+name.length;
  }
  const end=new Uint8Array(22),e=new DataView(end.buffer);
  e.setUint32(0,0x06054b50,true);e.setUint16(8,entries.length,true);e.setUint16(10,entries.length,true);e.setUint32(12,directoryBytes,true);e.setUint32(16,offset,true);
  return new Blob([...parts,...directory,end],{type:'application/zip'});
}
