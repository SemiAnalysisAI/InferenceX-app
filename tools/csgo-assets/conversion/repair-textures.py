import bpy
import os
import sys
import json
import struct
from pathlib import Path
sys.path.insert(0, os.environ.get("SOURCEIO_PARENT", os.getcwd()))
import SourceIO
SourceIO.register()
from SourceIO.blender_bindings.source1.vtf import import_texture
from SourceIO.library.utils import FileBuffer, TinyPath
root=Path(os.environ.get("CSGO_BUILD_ROOT", str(Path(__file__).resolve().parent)))
models=Path(os.environ.get("CSGO_MODELS", str(root/"models")))
output=root/"repaired-textures"
output.mkdir(exist_ok=True)
needed=set()
for file in models.glob("*.glb"):
    data=file.read_bytes()
    size=struct.unpack_from("<I",data,12)[0]
    gltf=json.loads(data[20:20+size])
    for image in gltf.get("images",[]):
        if image.get("name","").startswith("missing_"):
            needed.add(image["name"][8:])
textures={}
for directory in ("rifles/materials", "weapons/materials", "characters/materials"):
    for candidate in (root/directory).rglob("*.vtf"):
        textures.setdefault(candidate.stem.lower(), []).append(candidate)
for name in sorted(needed):
    candidates=textures.get(name.lower(), [])
    candidates.sort(key=lambda p:("v_models" not in str(p),len(str(p))))
    if not candidates:
        raise RuntimeError("Missing original VTF: "+name)
    path=candidates[0]
    with FileBuffer(TinyPath(str(path))) as buffer:
        image=import_texture(TinyPath(str(path)),buffer)
    if max(image.size)>1024:
        ratio=1024/max(image.size);image.scale(round(image.size[0]*ratio),round(image.size[1]*ratio))
    image.filepath_raw=str(output/(name+".png"))
    image.file_format="PNG"
    image.save()
    print("REPAIRED",name,path,flush=True)
