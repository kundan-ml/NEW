type Size={width:number;height:number};
type ImageRect=Size&{x:number;y:number};

/** Keep a usable patch of the actual image inside its viewport on both axes. */
export function constrainImagePan(viewport:Size,image:ImageRect):{x:number;y:number}{
  const clampAxis=(position:number,imageLength:number,viewportLength:number)=>{
    if(!Number.isFinite(imageLength)||!Number.isFinite(viewportLength)||imageLength<=0||viewportLength<=0)return Number.isFinite(position)?position:0;
    const visible=Math.min(48,imageLength*.25,viewportLength*.25);
    const desired=Number.isFinite(position)?position:(viewportLength-imageLength)/2;
    return Math.max(visible-imageLength,Math.min(viewportLength-visible,desired));
  };
  return {x:clampAxis(image.x,image.width,viewport.width),y:clampAxis(image.y,image.height,viewport.height)};
}
