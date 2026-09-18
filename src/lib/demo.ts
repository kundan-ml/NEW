import type {DatasetSummary,InspectionResult,LogRow,Sample,StorageRuntime,SystemInfo} from '@/types';

export const DEMO_DATASET_ID='oaklin-demo-line-1';

export const demoDataset:DatasetSummary={
  id:DEMO_DATASET_ID,
  name:'GDL6BV2 · Live production preview',
  source_type:'demo',
  source_path:'Built-in presentation data',
  sample_count:320,
  image_count:640,
  categories:{TOR:192,MFR:80,SIL:48},
  channels:{h:320,d:320},
  created_at:new Date().toISOString()
};

export const demoSystemInfo:SystemInfo={
  app:'Oaklin Lens Inspection',
  version:'7.4',
  mode:'AUTO',
  bridge:'HALCON online · preview feed',
  settings:{
    station_name:'Station 2',
    line_name:'GDL6BV2',
    installation_name:'Oaklin Production',
    station_index:2,
    role:'Operator',
    channel_labels:{h:'Telecentric',d:'Dark Field',n:'Diffuse',p:'Phase Contrast'},
    image_format:'TIF'
  },
  session:{username:'Operator',role:'Operator',logged_in:true}
};

const defectNames=['Edge deformation','Surface inclusion','Optical zone mark','Bevel irregularity','Micro scratch'];

function statusFor(wt:number,position:number):'OK'|'NOK'|'WARN'{
  if((wt+position*7)%37===0||(wt*3+position)%53===0)return 'NOK';
  if((wt+position*5)%29===0)return 'WARN';
  return 'OK';
}

export const demoSamples:Sample[]=[];
export const demoResults:InspectionResult[]=[];

for(let wt=939;wt<=958;wt+=1){
  for(let position=1;position<=16;position+=1){
    const id=`demo-wt-${wt}-p-${position}`;
    const forcedCurrent=wt===958&&position===7;
    const status=forcedCurrent?'NOK':statusFor(wt,position);
    const type=position%7===0?'SIL':position%3===0?'MFR':'TOR';
    const sample:Sample={
      id,
      position,
      wt_index:wt,
      category:type,
      base_name:`GDL06-${wt}-${String(position).padStart(2,'0')}`,
      metadata:{
        image_no:String(wt*16+position),
        machine:'CT3150',
        code:`GDL06${String(wt).padStart(4,'0')}${String(position).padStart(2,'0')}`,
        defect_label:status==='OK'?'Within tolerance':status==='WARN'?'Review requested':'Defect detected',
        event_id:`EV-${246100+wt*16+position}`,
        io_code:`CV-${1092-(958-wt)}`
      },
      images:{
        h:{channel:'h',filename:`${id}-h.tif`,relative_path:`demo:lens:${wt}:${position}:h:${status}`,absolute_path:''},
        d:{channel:'d',filename:`${id}-d.tif`,relative_path:`demo:lens:${wt}:${position}:d:${status}`,absolute_path:''},
        n:{channel:'n',filename:`${id}-n.tif`,relative_path:`demo:lens:${wt}:${position}:n:${status}`,absolute_path:''},
        p:{channel:'p',filename:`${id}-p.tif`,relative_path:`demo:lens:${wt}:${position}:p:${status}`,absolute_path:''}
      }
    };
    const defectCount=forcedCurrent?3:status==='NOK'?1+(position%2):status==='WARN'?1:0;
    const defects=Array.from({length:defectCount},(_,index)=>({
      name:forcedCurrent?['Edge deformation','Edge deformation','Surface inclusion'][index]:defectNames[(wt+position+index)%defectNames.length],
      confidence:.86+((position+index)%10)/100,
      bbox_xywh_norm:forcedCurrent?[[.74,.19,.13,.10],[.72,.68,.16,.09],[.20,.67,.08,.06]][index]:[.18+((position*11+index*17)%52)/100,.18+((wt+index*13)%50)/100,.08,.06],
      channel:index%2?'d':'h',
      severity:(status==='NOK'?'major':'minor') as 'major'|'minor',
      tolerance:'AT' as const,
      size_px:28+position+index*9,
      position_text:forcedCurrent?['~ 2 o’clock','~ 5 o’clock','~ 8 o’clock'][index]:`~ ${((position+index)%12)+1} o’clock`
    }));
    demoSamples.push(sample);
    demoResults.push({
      dataset_id:DEMO_DATASET_ID,
      sample_id:id,
      position,
      wt_index:wt,
      category:type,
      status,
      expected_label:'OK',
      channels:[],
      defects,
      created_at:new Date(Date.now()-(958-wt)*3600000-position*54000).toISOString()
    });
  }
}

export const DEMO_CURRENT_ID='demo-wt-958-p-7';

export const demoLogs:LogRow[]=[
  {time:'09:26:48',level:'error',message:'Lens NOK at position 7 · edge deformation'},
  {time:'09:26:32',level:'info',message:'Inspection completed for position 6 · OK'},
  {time:'09:26:17',level:'system',message:'Camera exposure adjusted automatically'},
  {time:'09:25:58',level:'info',message:'Tray index moved to position 7'},
  {time:'09:25:44',level:'info',message:'Inspection completed for position 5 · OK'},
  {time:'09:25:21',level:'system',message:'Recipe GDL6BV2 loaded'},
  {time:'09:24:03',level:'info',message:'System in automatic operation'}
];

export const demoStorage:StorageRuntime={
  active:true,
  started_at:new Date(Date.now()-6*3600000).toISOString(),
  saved_lenses:42560,
  saved_images:85120,
  event_count:143,
  position_counts:{'7':238,'14':181,'3':116},
  error_counts:{'Edge deformation':48,'Surface inclusion':31,'Micro scratch':22},
  last_saved_at:new Date().toISOString(),
  reason:'Automatic production archive'
};
