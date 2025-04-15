import comfy.sd
import comfy.samplers # For accessing lists of SAMPLERS and SCHEDULERS
import folder_paths
import json
import inspect # For type verification

# Define a custom type for "pipe" for better readability
PIPE_TYPE_NAME = "PARAMS_PIPE"

# --- Node 1: ModelParamsPipeNode ---
class ModelParamsPipeNode:
    @classmethod
    def INPUT_TYPES(cls):
        samplers = comfy.samplers.KSampler.SAMPLERS
        schedulers = comfy.samplers.KSampler.SCHEDULERS
        return {
            "required": {
                "ckpt_name": (folder_paths.get_filename_list("checkpoints"),),
                "steps": ("INT", {"default": 20, "min": 1, "max": 10000}),
                "cfg": ("FLOAT", {"default": 7.0, "min": 0.0, "max": 100.0, "step": 0.1}),
                "sampler_name": (samplers,),
                "scheduler": (schedulers,),
                "positive_tag": ("STRING", {"multiline": True, "default": ""}),
                "negative_tag": ("STRING", {"multiline": True, "default": ""}),
                "clip_skip": ("INT", {"default": -2, "min": -12, "max": 0, "step": 1}),
            },
            "optional": {
                "vae_override": ("VAE",),
            }
        }

    RETURN_TYPES = ("MODEL", "CLIP", "VAE",
                    "INT", "FLOAT", "STRING", "STRING", "STRING", "STRING",
                    PIPE_TYPE_NAME)
    RETURN_NAMES = ("MODEL", "CLIP", "VAE",
                    "steps", "cfg", "sampler_name", "scheduler",
                    "positive_tag", "negative_tag",
                    "params_pipe")
    FUNCTION = "process_to_pipe"
    CATEGORY = "MultiModel"

    def process_to_pipe(self, ckpt_name, steps, cfg, sampler_name, scheduler,
                        positive_tag, negative_tag, clip_skip, vae_override=None):
        ckpt_path = folder_paths.get_full_path("checkpoints", ckpt_name)
        out = comfy.sd.load_checkpoint_guess_config(ckpt_path, output_vae=True, output_clip=True, embedding_directory=folder_paths.get_folder_paths("embeddings"))
        model = out[0]
        clip = out[1]
        vae_from_checkpoint = out[2]
        clip_skipped = clip.clone()
        clip_skipped.clip_layer(clip_skip)
        final_vae = vae_override if vae_override is not None else vae_from_checkpoint
        combined_params = {
            "ckpt_name": ckpt_name, "steps": steps, "cfg": cfg,
            "sampler_name": str(sampler_name), "scheduler": str(scheduler),
            "positive_tag": positive_tag.strip() if isinstance(positive_tag, str) else positive_tag,
            "negative_tag": negative_tag.strip() if isinstance(negative_tag, str) else negative_tag,
            "clip_skip": clip_skip
        }
        pipe_data = (model, clip_skipped, final_vae, combined_params)
        return (model, clip_skipped, final_vae, steps, cfg, str(sampler_name), str(scheduler),
                positive_tag, negative_tag, pipe_data)

# --- Node 2: ParamsPipeUnpack ---
class ParamsPipeUnpack:
    @classmethod
    def INPUT_TYPES(cls):
        return { "required": { "params_pipe": (PIPE_TYPE_NAME,), } }

    RETURN_TYPES = ("MODEL", "CLIP", "VAE", "INT", "FLOAT",
                    comfy.samplers.KSampler.SAMPLERS, comfy.samplers.KSampler.SCHEDULERS,
                    "STRING", "STRING", PIPE_TYPE_NAME)
    RETURN_NAMES = ("MODEL", "CLIP", "VAE", "steps", "cfg",
                    "sampler_name", "scheduler",
                    "positive_tag", "negative_tag", "params_pipe")
    FUNCTION = "unpack_pipe"
    CATEGORY = "MultiModel"

    def unpack_pipe(self, params_pipe):
        if not isinstance(params_pipe, tuple) or len(params_pipe) != 4:
             raise ValueError(f"Unpack: Expected PARAMS_PIPE tuple of length 4, but got: {type(params_pipe)}")
        model, clip, vae, params_dict = params_pipe
        if not isinstance(params_dict, dict):
            raise ValueError(f"Unpack: Expected dict as the 4th element in PARAMS_PIPE, but got: {type(params_dict)}")
        steps = params_dict.get("steps")
        cfg = params_dict.get("cfg")
        sampler_name = params_dict.get("sampler_name")
        scheduler = params_dict.get("scheduler")
        positive_tag = params_dict.get("positive_tag")
        negative_tag = params_dict.get("negative_tag")
        return (model, clip, vae, steps, cfg, sampler_name, scheduler,
                positive_tag, negative_tag, params_pipe)


# --- Registration for only the first two nodes ---
NODE_CLASS_MAPPINGS = {
    "ModelParamsPipeNode": ModelParamsPipeNode,
    "ParamsPipeUnpack": ParamsPipeUnpack
}

# --- Display names for only the first two nodes ---
NODE_DISPLAY_NAME_MAPPINGS = {
    "ModelParamsPipeNode": "Model Parameters Pipe Hub",
    "ParamsPipeUnpack": "Unpack Parameters Pipe"
}

# Loading message
print("✅ Loaded custom nodes (Reverted): ModelParamsPipeNode, ParamsPipeUnpack  ▪B ▪B ▪С")
