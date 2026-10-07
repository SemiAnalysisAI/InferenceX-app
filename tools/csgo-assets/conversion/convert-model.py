import bpy
import sys
import os
from pathlib import Path
sys.path.insert(0, os.environ.get("SOURCEIO_PARENT", os.getcwd()))
import SourceIO
SourceIO.register()
from SourceIO.blender_bindings.operators.import_settings_base import ModelOptions
for key, value in vars(ModelOptions.default()).items():
    setattr(ModelOptions, key, value)
args = sys.argv[sys.argv.index("--")+1:]
path, out = args[:2]
bpy.ops.object.select_all(action="SELECT")
bpy.ops.object.delete(use_global=False)
bpy.ops.sourceio.mdl(filepath=path, directory=os.path.dirname(path), files=[{"name":os.path.basename(path)}],
                    import_textures=True, import_animations=True,
                    import_include_animations=False, create_flex_drivers=False,
                    compact_animations=False, scale=0.01905, bodygroup_grouping=False)
if len(args) > 2:
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    from import_smd_motion import import_character_motion
    import_character_motion(Path(args[2]))
for material in bpy.data.materials:
    if not material.use_nodes:
        continue
    images=[n.image for n in material.node_tree.nodes if n.type=="TEX_IMAGE" and n.image]
    if not images:
        continue
    base=next((i for i in images if not any(s in i.name.lower() for s in ("normal","_n.","_n_","blend","mask"))),images[0])
    material.node_tree.nodes.clear()
    shader=material.node_tree.nodes.new("ShaderNodeBsdfPrincipled")
    shader.inputs["Roughness"].default_value=.65
    tex=material.node_tree.nodes.new("ShaderNodeTexImage");tex.image=base
    output=material.node_tree.nodes.new("ShaderNodeOutputMaterial")
    material.node_tree.links.new(tex.outputs["Color"],shader.inputs["Base Color"])
    material.node_tree.links.new(shader.outputs["BSDF"],output.inputs["Surface"])
for image in bpy.data.images:
    if image.size[0]>1024 or image.size[1]>1024:
        ratio=min(1024/image.size[0],1024/image.size[1]);image.scale(int(image.size[0]*ratio),int(image.size[1]*ratio))
os.makedirs(os.path.dirname(out),exist_ok=True)
bpy.ops.export_scene.gltf(filepath=out,export_format="GLB",export_animations=True,
                          export_animation_mode="ACTIONS",export_cameras=False,
                          export_lights=False,export_image_format="JPEG",
                          export_jpeg_quality=90)
print("MODEL_EXPORTED",len(bpy.data.objects),len(bpy.data.actions),out)
