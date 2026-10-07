import bpy
import sys
import os
sys.path.insert(0, os.environ.get("SOURCEIO_PARENT", os.getcwd()))
import SourceIO
SourceIO.register()
from SourceIO.blender_bindings.operators.import_settings_base import ModelOptions
for key, value in vars(ModelOptions.default()).items():
    setattr(ModelOptions, key, value)
bpy.ops.object.select_all(action="SELECT")
bpy.context.scene.use_instances = True
bpy.ops.object.delete(use_global=False)
path = sys.argv[sys.argv.index("--") + 1]
out = sys.argv[sys.argv.index("--") + 2]
os.makedirs(out, exist_ok=True)
if "--reuse" in sys.argv:
    bpy.ops.wm.open_mainfile(filepath=out + "/map.blend")
else:
    bpy.ops.sourceio.bsp(filepath=path, steam_app_id="730", import_textures=True,
                         load_lights=False, load_decals=False, load_info=True)
    for text in bpy.data.texts:
        if text.name.endswith("_entities.json"):
            with open(out + "/entities.json", "w") as f:
                f.write(text.as_string())
    print("IMPORT_COMPLETE", len(bpy.data.objects), len(bpy.data.images), flush=True)
    bpy.ops.object.select_all(action="SELECT")
    try:
        bpy.ops.sourceio.load_placeholder()
    except Exception as error:
        print("PROP_ERROR", error, flush=True)
    bpy.ops.wm.save_as_mainfile(filepath=out + "/map.blend")
print("PROPS_COMPLETE", len(bpy.data.objects), len(bpy.data.images), flush=True)
for material in bpy.data.materials:
    if not material.use_nodes:
        continue
    images = [n.image for n in material.node_tree.nodes if n.type == "TEX_IMAGE" and n.image]
    if not images:
        continue
    base = next((i for i in images if not any(s in i.name.lower() for s in ("normal", "_n.", "_n_", "blend", "mask"))), images[0])
    material.node_tree.nodes.clear()
    shader = material.node_tree.nodes.new("ShaderNodeBsdfPrincipled")
    shader.inputs["Roughness"].default_value = 0.92
    tex = material.node_tree.nodes.new("ShaderNodeTexImage")
    tex.image = base
    output = material.node_tree.nodes.new("ShaderNodeOutputMaterial")
    material.node_tree.links.new(tex.outputs["Color"], shader.inputs["Base Color"])
    material.node_tree.links.new(shader.outputs["BSDF"], output.inputs["Surface"])
for image in bpy.data.images:
    if image.size[0] > 512 or image.size[1] > 512:
        ratio = min(512 / image.size[0], 512 / image.size[1])
        image.scale(int(image.size[0] * ratio), int(image.size[1] * ratio))
bpy.ops.export_scene.gltf(filepath=out + "/dust2.glb", export_format="GLB", export_gpu_instances=True,
                          use_visible=True,
                          export_animations=False, export_cameras=False,
                          export_lights=False, export_image_format="JPEG",
                          export_jpeg_quality=85)
print("EXPORT_COMPLETE", flush=True)
