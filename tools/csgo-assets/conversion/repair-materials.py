"""Fill textureless GLB materials from their original VMT base-texture entries."""
import os
import sys
import json
import re
import struct
from pathlib import Path
sys.path.insert(0, os.environ.get("SOURCEIO_PARENT", os.getcwd()))
import SourceIO
SourceIO.register()
from SourceIO.blender_bindings.source1.vtf import import_texture
from SourceIO.library.utils import FileBuffer, TinyPath

root = Path(os.environ["CSGO_BUILD_ROOT"])
models = Path(os.environ["CSGO_MODELS"])
output = root / "material-textures"
output.mkdir(exist_ok=True)
materials, textures = {}, {}
for directory in ("rifles/materials", "weapons/materials", "characters/materials"):
    for file in (root / directory).rglob("*"):
        if file.suffix.lower() == ".vmt":
            materials.setdefault(file.stem.lower(), []).append(file)
        elif file.suffix.lower() == ".vtf":
            textures[str(file.relative_to(root / directory)).lower()] = file

def padded(data, fill=b"\0"):
    return data + fill * ((-len(data)) % 4)

for file in sorted(models.glob("*.glb")):
    raw = file.read_bytes()
    size = struct.unpack_from("<I", raw, 12)[0]
    doc = json.loads(raw[20:20 + size])
    binary = bytearray(raw[28 + size:])
    changes = 0
    for material in doc.get("materials", []):
        pbr = material.setdefault("pbrMetallicRoughness", {})
        if "baseColorTexture" in pbr:
            continue
        name = material.get("name", "").lower()
        candidates = sorted(materials.get(name, []), key=lambda p: ("v_models" not in str(p), len(str(p))))
        match = None
        for vmt in candidates:
            text = re.sub(r"//[^\n]*", "", vmt.read_text(errors="replace"))
            match = re.search(r'"?\$basetexture"?\s+"?([^"\s]+)', text, re.I)
            if match:
                break
        if not match:
            if "glass" in name:
                material["alphaMode"] = "BLEND"
                pbr["baseColorFactor"] = [0.15, 0.23, 0.25, 0.2]
                continue
            raise RuntimeError(f"No original base texture for {file.name}: {name}")
        texture_name = match.group(1).replace("\\", "/").lower() + ".vtf"
        texture = textures.get(texture_name)
        if not texture:
            raise RuntimeError(f"Missing original VTF {texture_name}")
        png_path = output / (texture.stem + ".png")
        if not png_path.exists():
            with FileBuffer(TinyPath(str(texture))) as buffer:
                image = import_texture(TinyPath(str(texture)), buffer)
            ratio = min(1, 1024 / max(image.size))
            if ratio < 1:
                image.scale(round(image.size[0] * ratio), round(image.size[1] * ratio))
            image.filepath_raw = str(png_path)
            image.file_format = "PNG"
            image.save()
        png = png_path.read_bytes()
        view = len(doc.setdefault("bufferViews", []))
        doc["bufferViews"].append({"buffer": 0, "byteOffset": len(binary), "byteLength": len(png)})
        binary.extend(padded(png))
        image_index = len(doc.setdefault("images", []))
        doc["images"].append({"name": texture.stem, "mimeType": "image/png", "bufferView": view})
        index = len(doc.setdefault("textures", []))
        doc["textures"].append({"source": image_index})
        pbr["baseColorTexture"] = {"index": index}
        pbr["baseColorFactor"] = [1, 1, 1, 1]
        changes += 1
    doc["buffers"][0]["byteLength"] = len(binary)
    encoded = padded(json.dumps(doc, separators=(",", ":")).encode(), b" ")
    file.write_bytes(struct.pack("<4sIIII", b"glTF", 2, 28 + len(encoded) + len(binary), len(encoded), 0x4E4F534A)
                     + encoded + struct.pack("<I4s", len(binary), b"BIN\0") + binary)
    print("MATERIALS_REPAIRED", file.name, changes, flush=True)
