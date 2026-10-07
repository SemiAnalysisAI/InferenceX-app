import os
import subprocess
import sys
from pathlib import Path
root=Path(os.environ.get("CSGO_BUILD_ROOT", str(Path(__file__).resolve().parent)))
names={
 "v_rif_ak47":"ak-47","v_rif_aug":"aug","v_rif_famas":"famas","v_rif_galilar":"galil_ar",
 "v_rif_m4a1":"m4a4","v_rif_m4a1_s":"m4a1_s","v_rif_sg556":"sg_553",
 "v_snip_scar20":"scar-20","v_shot_xm1014":"xm1014","v_snip_g3sg1":"g3sg1",
 "v_smg_mac10":"mac-10","v_shot_sawedoff":"sawed-off","v_smg_mp7":"mp7",
 "v_mach_negev":"negev","v_pist_revolver":"revolver","v_pist_glock18":"glock-18",
 "v_smg_bizon":"bizon","v_pist_fiveseven":"five-seven","v_mach_m249para":"m249",
 "v_pist_p250":"p250","v_smg_p90":"p90","v_shot_nova":"nova","v_pist_223":"usp-s",
 "v_pist_deagle":"desert_eagle","v_snip_ssg08":"ssg_08","v_smg_mp9":"mp9",
 "v_pist_tec9":"tec-9","v_pist_hkp2000":"p2000","v_shot_mag7":"mag-7",
 "v_smg_mp5sd":"mp5sd","v_pist_elite":"dual_berettas","v_smg_ump45":"ump-45",
 "v_snip_awp":"awp","v_pist_cz_75":"cz_75",
}
for stem,name in names.items():
    if "--world" in sys.argv:
        stem = "w_" + stem[2:]
        if name == "m249":
            stem = "w_mach_m249"
    source=root/"weapons/models/csgo/weapons"/(stem+".mdl")
    if not source.exists():
        source=root/"rifles/models/csgo/weapons"/(stem+".mdl")
    output=root/("worldmodels" if "--world" in sys.argv else "models")/(name+".glb")
    if "--resume" in sys.argv and output.exists():
        continue
    with open("/tmp/convert-"+name+".log","w") as log:
        subprocess.run(["blender","--background","--factory-startup","--python",str(Path(__file__).with_name("convert-model.py")),
                        "--",str(source),str(output)],stdout=log,stderr=subprocess.STDOUT,check=True)
    if not output.exists():
        raise RuntimeError("No converted model for "+name)
    print("CONVERTED",name,output.stat().st_size,flush=True)
