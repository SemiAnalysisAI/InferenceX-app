"""Restore VMT alpha-test/translucency lost by the simplified GLB export."""
import os
import sys
import json
import re
import struct
import zipfile
from pathlib import Path
sys.path.insert(0, os.environ.get("SOURCEIO_PARENT", os.getcwd()))
import SourceIO
SourceIO.register()
from SourceIO.blender_bindings.source1.vtf import import_texture
from SourceIO.library.utils import MemoryBuffer, TinyPath

args = sys.argv[sys.argv.index("--") + 1:]
glb, pak, output = map(Path, args[:3])
output.mkdir(parents=True, exist_ok=True)
data = glb.read_bytes()
size = struct.unpack_from("<I", data, 12)[0]
document = json.loads(data[20:20 + size])
binary = bytearray(data[28 + size:])
def padded(data, fill=b"\0"):
    return data + fill * ((-len(data)) % 4)

with zipfile.ZipFile(pak) as archive:
    entries = {name.lower(): name for name in archive.namelist()}
    materials = {}
    for name in archive.namelist():
        if not name.lower().endswith(".vmt"):
            continue
        text = archive.read(name).decode("utf-8", errors="replace")
        alpha = re.search(r'"?\$alphatest"?\s+"?1', text, re.I)
        translucent = re.search(r'"?\$translucent"?\s+"?1', text, re.I)
        texture = re.search(r'"?\$basetexture"?\s+"([^"]+)"', text, re.I)
        if (alpha or translucent) and texture:
            materials[Path(name).stem.lower()] = (texture.group(1).replace("\\", "/"), bool(alpha))
    for material in document.get("materials", []):
        key = material.get("name", "").lower()
        if key not in materials:
            continue
        texture, alpha = materials[key]
        file = entries.get(("materials/" + texture + ".vtf").lower())
        if not file:
            raise RuntimeError("Missing alpha texture: " + texture)
        image = import_texture(TinyPath(texture), MemoryBuffer(archive.read(file)))
        ratio = min(1, 512 / max(image.size))
        if ratio < 1:
            image.scale(round(image.size[0] * ratio), round(image.size[1] * ratio))
        image.filepath_raw = str(output / (key + ".png"))
        image.file_format = "PNG"
        image.save()
        png = Path(image.filepath_raw).read_bytes()
        view = len(document["bufferViews"])
        document["bufferViews"].append({"buffer": 0, "byteOffset": len(binary), "byteLength": len(png)})
        binary.extend(padded(png))
        image_index = len(document["images"])
        document["images"].append({"bufferView": view, "mimeType": "image/png", "name": key + "_rgba"})
        texture_index = len(document["textures"])
        previous = material["pbrMetallicRoughness"]["baseColorTexture"]["index"]
        new_texture = dict(document["textures"][previous])
        new_texture["source"] = image_index
        document["textures"].append(new_texture)
        material["pbrMetallicRoughness"]["baseColorTexture"]["index"] = texture_index
        material["alphaMode"] = "MASK" if alpha else "BLEND"
        material["alphaCutoff"] = 0.5
        material["doubleSided"] = True
        print("ALPHA_RESTORED", key, flush=True)
document["buffers"][0]["byteLength"] = len(binary)
encoded = padded(json.dumps(document, separators=(",", ":")).encode(), b" ")
header = struct.pack("<4sIIII", b"glTF", 2, 28 + len(encoded) + len(binary), len(encoded), 0x4E4F534A)
glb.write_bytes(header + encoded + struct.pack("<I4s", len(binary), b"BIN\0") + binary)
