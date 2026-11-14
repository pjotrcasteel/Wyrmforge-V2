// Natural Wet Forest geography profiles keyed by the World Map's existing
// region role, never a new biome or gameplay rule. Existing authored corridors
// and combat flow still grade the resulting physical terrain afterwards.
const PROFILES=Object.freeze({
  arrival:{landmark:'forest-waystone',rise:0.3,basin:0.6,rock:0.97,span:6,wetX:-12,wetZ:7},
  exploration:{landmark:'forest-crossroads',rise:0.65,basin:1.15,rock:0.94,span:7,wetX:-12,wetZ:7},
  horde:{landmark:'forest-standing-stone',rise:0.45,basin:0.55,rock:0.96,span:9,wetX:-13,wetZ:10},
  investigation:{landmark:'forest-ruin',rise:1.05,basin:0.7,rock:0.87,span:6,wetX:-11,wetZ:8},
  discovery:{landmark:'buried-grove',rise:0.65,basin:1.6,rock:0.95,span:7,wetX:-12,wetZ:7},
  flank:{landmark:'forest-overlook',rise:1.4,basin:0.65,rock:0.89,span:5,wetX:-12,wetZ:8},
  extraction:{landmark:'forest-exit-marker',rise:0.25,basin:0.55,rock:0.97,span:7,wetX:-13,wetZ:10}
});
for(const profile of Object.values(PROFILES))Object.freeze(profile);

export function wetForestRegionProfile(role,seed){
  const profile=PROFILES[role];
  if(!profile||!Number.isSafeInteger(seed))throw new RangeError('Unknown forest region profile');
  // Seed controls which side contains the more elevated natural shoulder.
  // Do not relocate graph ports or flatten the entire outer footprint.
  const mirror=(seed&1)?1:-1;
  const {wetX,wetZ,span}=profile;
  return Object.freeze({...profile,wetX:wetX*mirror,wetZ,
    relief(x,z){
      const broad=Math.exp(-((x-12*mirror)**2+(z+9)**2)/110);
      const hollow=Math.exp(-((x-wetX*mirror)**2+(z-wetZ)**2)/(span*span+20));
      return profile.rise*broad-profile.basin*hollow;
    }
  });
}
