export type IlluminationChannel='h'|'p'|'d'|'n';
export type IlluminationImages=Partial<Record<IlluminationChannel,File>>;
export const ILLUMINATION_IMAGE_PATTERN=/\.(bmp|tif|tiff)$/i;

const LABELS:Record<IlluminationChannel,string>={h:'Telecentric Brightfield',d:'Dark Field',n:'Diffuse Brightfield',p:'Phase Contrast'};
// Physical camera order from the OKLIN manual; keys match the backend parser.
const NUMBERED_CHANNELS:Record<string,IlluminationChannel>={'1':'h','2':'d','3':'n','4':'p'};

export function inferIlluminationChannel(filename:string):IlluminationChannel|null{
  const stem=filename.replace(ILLUMINATION_IMAGE_PATTERN,'').toLowerCase();
  const numbered=stem.match(/#([1-4])$/);
  if(numbered)return NUMBERED_CHANNELS[numbered[1]];
  const letter=stem.match(/\.([hdnp])$/);
  if(letter)return letter[1] as IlluminationChannel;
  const matches:IlluminationChannel[]=[];
  if(/dark[\s._-]*field|dunkel/.test(stem))matches.push('d');
  if(/phase[\s._-]*contrast|phasen/.test(stem))matches.push('p');
  if(/telecentric|telezentr/.test(stem))matches.push('h');
  if(/diffus(?:e|ed)?|spot/.test(stem))matches.push('n');
  return matches.length===1?matches[0]:null;
}

function illuminationImageGroup(filename:string):string|null{
  const stem=filename.replace(ILLUMINATION_IMAGE_PATTERN,'').toLowerCase();
  const base=stem.replace(/(?:_fj(?:-d\d+)?)?#[1-4]$|\.([hdnp])$|[\s._-]*(?:dark[\s._-]*field|phase[\s._-]*contrast|telecentric(?:[\s._-]*(?:bright[\s._-]*field|bf))?|diffus(?:e|ed)?(?:[\s._-]*(?:bright[\s._-]*field|bf))?|spot|dunkel|phasen)$/,'').replace(/[\s._-]+$/,'');
  return base||null;
}

type ImageMappingResult={ok:true;images:IlluminationImages}|{ok:false;message:string};

export function mapIlluminationImages(files:readonly File[]):ImageMappingResult{
  if(files.length<3||files.length>4)return {ok:false,message:'Select 3 or 4 images together, or one image to replace this illumination.'};
  const invalid=files.find(file=>!ILLUMINATION_IMAGE_PATTERN.test(file.name));
  if(invalid)return {ok:false,message:`Unsupported image: ${invalid.name}. Use BMP or TIFF files.`};
  const images:IlluminationImages={};
  for(const file of files){
    const channel=inferIlluminationChannel(file.name);
    if(!channel)return {ok:false,message:`Cannot identify illumination for ${file.name}. Use #1–#4, .h/.d/.n/.p, or a descriptive illumination name; otherwise load it into one slot manually.`};
    if(images[channel])return {ok:false,message:`Two images match ${LABELS[channel]}. Choose one image per illumination.`};
    images[channel]=file;
  }
  const groups=files.map(file=>illuminationImageGroup(file.name)).filter((group):group is string=>!!group);
  if(groups.length>1&&new Set(groups).size>1)return {ok:false,message:'These images appear to belong to different lenses. Select one lens at a time.'};
  return {ok:true,images};
}
