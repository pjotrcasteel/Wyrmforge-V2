// Play Hunt owns input mapping. Keep the actual Voxel actor bounds strict.
export function huntScreenMovement(right,down,inspection=false) {
  if(![right,down].every(Number.isFinite))throw new TypeError('Expected finite screen movement');
  right=Math.max(-1,Math.min(1,right));
  down=Math.max(-1,Math.min(1,down));
  const length=Math.max(1,Math.hypot(right,down));
  right/=length;down/=length;
  const bound=n=>Math.max(-1,Math.min(1,n));
  return inspection?{
    moveX:bound((right+down)*Math.SQRT1_2),
    moveZ:bound((down-right)*Math.SQRT1_2)
  }:{moveX:right,moveZ:down};
}
