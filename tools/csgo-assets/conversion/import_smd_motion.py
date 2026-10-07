"""Retarget attributed GMod ValveBiped source motion, not original CS:GO animation."""
import re
import bpy
from mathutils import Matrix, Vector, Euler

SCALE = 0.01905


def read_smd(path):
    nodes, frames = {}, []
    section = None
    for line in path.read_text().splitlines():
        line = line.strip()
        if line in ("nodes", "skeleton"):
            section = line
        elif line == "end":
            section = None
        elif section == "nodes":
            index, name, parent = re.match(r'(\d+)\s+"([^"]+)"\s+(-?\d+)', line).groups()
            nodes[int(index)] = (name, int(parent))
        elif section == "skeleton":
            if line.startswith("time"):
                frames.append({})
            elif line:
                values = line.split()
                index = int(values[0])
                v = list(map(float, values[1:]))
                frames[-1][index] = Matrix.Translation(Vector(v[:3]) * SCALE) @ Euler(v[3:], "XYZ").to_matrix().to_4x4()
    return nodes, frames


def import_character_motion(root):
    armature = next(o for o in bpy.data.objects if o.type == "ARMATURE")
    armature.animation_data_clear()
    for action in list(bpy.data.actions):
        bpy.data.actions.remove(action)
    armature.animation_data_create()
    bpy.context.scene.render.fps = 30
    idle_nodes, idle_frames = read_smd(root / "combine_soldier_xsi/hold_smg1.smd")
    idle_local = {idle_nodes[i][0]: matrix for i, matrix in idle_frames[0].items()}
    sources = {
        "idle": "combine_soldier_xsi/hold_smg1.smd",
        "run": "base_m/runN.smd",
        "crouch": "base_m/crouch_idle.smd",
    }
    for name, file in sources.items():
        nodes, frames = read_smd(root / file)
        action = bpy.data.actions.new(name)
        action.use_fake_user = True
        armature.animation_data.action = action
        previous = {}
        for frame, local in enumerate(frames):
            world = {}
            for index, (bone_name, parent) in nodes.items():
                matrix = local.get(index, frames[0].get(index, Matrix.Identity(4))).copy()
                if name != "idle" and any(part in bone_name for part in ("Spine", "Neck", "Head", "Clavicle", "Arm", "Hand", "Finger")):
                    matrix = idle_local.get(bone_name, matrix).copy()
                world[index] = world[parent] @ matrix if parent in world else matrix
            named = {nodes[i][0]: matrix for i, matrix in world.items()}
            center = named.get("ValveBiped.Bip01", Matrix.Identity(4)).translation.copy()
            # Remove horizontal root motion. The game's collision controller owns displacement.
            for matrix in named.values():
                matrix.translation.x -= center.x
                matrix.translation.y -= center.y
            for bone in armature.pose.bones:
                if bone.name not in named:
                    continue
                desired = named[bone.name]
                if bone.parent and bone.parent.name in named:
                    local_pose = named[bone.parent.name].inverted() @ desired
                    basis = bone.bone.matrix_local.inverted() @ bone.parent.bone.matrix_local @ local_pose
                else:
                    basis = bone.bone.matrix_local.inverted() @ desired
                position, rotation, _ = basis.decompose()
                if bone.name in previous and rotation.dot(previous[bone.name]) < 0:
                    rotation.negate()
                previous[bone.name] = rotation.copy()
                bone.rotation_mode = "QUATERNION"
                bone.location = position
                bone.rotation_quaternion = rotation
                bone.keyframe_insert("location", frame=frame)
                bone.keyframe_insert("rotation_quaternion", frame=frame)
        print("RETARGETED_MOTION", name, len(frames))
    armature.animation_data.action = bpy.data.actions.get("idle")
    bpy.context.scene.frame_set(0)
