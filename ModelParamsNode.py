import comfy.sd
import comfy.samplers # For accessing lists of SAMPLERS and SCHEDULERS
import comfy.sample
import folder_paths
import json
import inspect # For type verification
import torch
import comfy.utils # Потрібен для PROGRESS_BAR_ENABLED
# import comfy.latent_preview as latent_preview # Видалено
import comfy.model_management # Залишаємо, може бути потрібен для інших нод?
import os # Додано для роботи з шляхами
from server import PromptServer # Додано
from aiohttp import web # Додано

import git
from typing import Any, Dict
import yaml

# Проксі для любого типу
class AlwaysEqualProxy(str):
    def __eq__(self, _):
        return True
    def __ne__(self, _):
        return False

# Ревізія ComfyUI для lazy_options
comfy_ui_revision = None

def get_comfyui_revision() -> Any:
    try:
        repo = git.Repo(os.path.dirname(folder_paths.__file__))
        return len(list(repo.iter_commits('HEAD')))
    except:
        return "Unknown"

def compare_revision(num: int) -> bool:
    global comfy_ui_revision
    if comfy_ui_revision is None:
        comfy_ui_revision = get_comfyui_revision()
    return comfy_ui_revision == "Unknown" or int(comfy_ui_revision) >= num

WEB_DIRECTORY = "js" # Додано для JS файлу

MAX_FLOW_NUM = 10
lazy_options = {"lazy": True}

any_type = AlwaysEqualProxy("*")
# Define a custom type for "pipe" for better readability
PIPE_TYPE_NAME = "PARAMS_PIPE"
# IMG2TXT_TYPE_NAME = "IMG2TXT_STRING" # Видалено

# --- Helper Functions for Styles ---
def get_styles_dir():
    # Визначаємо шлях до папки Styles відносно поточного файлу
    return os.path.join(os.path.dirname(__file__), "Styles")

def get_style_files():
    styles_dir = get_styles_dir()
    if not os.path.isdir(styles_dir):
        return ["None"]
    files = [f for f in os.listdir(styles_dir) if (f.endswith('.json') or f.endswith('.yaml') or f.endswith('.yml')) and os.path.isfile(os.path.join(styles_dir, f))]
    return ["None"] + sorted(files)

def get_style_names(style_filename):
    # Прибираємо перевірку на "None" тут, бо API endpoint не повинен викликатися для "None"
    # Однак, якщо він все ж викликається, повернемо порожній список.
    if style_filename is None or style_filename == "None": 
        return []
    
    styles_dir = get_styles_dir()
    filepath = os.path.join(styles_dir, style_filename)
    
    names = [] # Ініціалізуємо порожнім списком, без "None"
    try:
        if os.path.isfile(filepath):
            if filepath.endswith('.yaml') or filepath.endswith('.yml'):
                with open(filepath, 'r', encoding='utf-8') as f:
                    data = yaml.safe_load(f)
            else:
                with open(filepath, 'r', encoding='utf-8') as f:
                    data = json.load(f)
            if isinstance(data, list):
                # Додаємо імена, пропускаючи порожні або None
                names.extend([item.get("name") for item in data if isinstance(item, dict) and item.get("name")])
    except Exception as e:
        print(f"Error loading style names from {filepath}: {e}")
        return [] # Повертаємо порожній список при помилці
        
    # Видаляємо дублікати (якщо є) і сортуємо. НЕ додаємо "None".
    unique_names = sorted(list(set(n for n in names if n))) # Додаткова фільтрація None/empty
    return unique_names

# Оновлена функція common_ksampler без latent_preview
def common_ksampler(model, seed, steps, cfg, sampler_name, scheduler, positive, negative, latent, denoise=1.0, disable_noise=False, start_step=None, last_step=None, force_full_denoise=False):
    latent_image = latent["samples"]
    latent_image = comfy.sample.fix_empty_latent_channels(model, latent_image)

    if disable_noise:
        noise = torch.zeros(latent_image.size(), dtype=latent_image.dtype, layout=latent_image.layout, device="cpu")
    else:
        batch_inds = latent["batch_index"] if "batch_index" in latent else None
        noise = comfy.sample.prepare_noise(latent_image, seed, batch_inds)

    noise_mask = None
    if "noise_mask" in latent:
        noise_mask = latent["noise_mask"]

    # callback = latent_preview.prepare_callback(model, steps) # Видалено рядок з колбеком
    callback = None # Встановлюємо колбек в None
    disable_pbar = not comfy.utils.PROGRESS_BAR_ENABLED
    samples = comfy.sample.sample(model, noise, steps, cfg, sampler_name, scheduler, positive, negative, latent_image,
                                  denoise=denoise, disable_noise=disable_noise, start_step=start_step, last_step=last_step,
                                  force_full_denoise=force_full_denoise, noise_mask=noise_mask, callback=callback, disable_pbar=disable_pbar, seed=seed)
    out = latent.copy()
    out["samples"] = samples
    return (out, )

# --- Node 1: ModelParamsPipeNode ---
class ModelParamsPipeNode:
    @classmethod
    def INPUT_TYPES(cls):
        samplers = comfy.samplers.KSampler.SAMPLERS
        schedulers = comfy.samplers.KSampler.SCHEDULERS
        return {
            "required": {
                # Переносимо теги на початок
                "positive_tag": ("STRING", {"multiline": True, "default": ""}),
                "negative_tag": ("STRING", {"multiline": True, "default": ""}),
                # Решта полів
                "ckpt_name": (folder_paths.get_filename_list("checkpoints"),),
                "steps": ("INT", {"default": 20, "min": 1, "max": 10000}),
                "cfg": ("FLOAT", {"default": 7.0, "min": 0.0, "max": 100.0, "step": 0.1}),
                "sampler_name": (samplers,),
                "scheduler": (schedulers,),
                "clip_skip": ("INT", {"default": -2, "min": -12, "max": 0, "step": 1}),
            },
            "optional": {
                "vae_override": ("VAE",),
            }
        }

    RETURN_TYPES = ("MODEL", "CLIP", "VAE",
                    "INT", "FLOAT", comfy.samplers.KSampler.SAMPLERS, comfy.samplers.KSampler.SCHEDULERS,
                    "STRING", "STRING",
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
        
        # Safely handle positive_tag and negative_tag even if they're None
        safe_positive_tag = "" if positive_tag is None else positive_tag.strip()
        safe_negative_tag = "" if negative_tag is None else negative_tag.strip()
        
        # Store the original sampler_name and scheduler objects
        combined_params = {
            "ckpt_name": ckpt_name, 
            "steps": steps, 
            "cfg": cfg,
            "sampler_name": sampler_name, 
            "scheduler": scheduler,
            "positive_tag": safe_positive_tag,
            "negative_tag": safe_negative_tag,
            "clip_skip": clip_skip
        }
        pipe_data = (model, clip_skipped, final_vae, combined_params)
        
        # Convert sampler_name and scheduler to string only for display purposes
        return (model, clip_skipped, final_vae, steps, cfg, 
                sampler_name, scheduler,
                safe_positive_tag, safe_negative_tag, pipe_data)

# --- Node 2: ParamsPipeUnpack ---
class ParamsPipeUnpack:
    @classmethod
    def INPUT_TYPES(cls):
        return { "required": { "params_pipe": (PIPE_TYPE_NAME,), } }

    # Змінюємо типи повернення для sampler_name та scheduler
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
        
        # Get parameters with proper type checking
        steps = params_dict.get("steps", 20)
        cfg = params_dict.get("cfg", 7.0)
        sampler_name = params_dict.get("sampler_name", "euler_ancestral")  # Отримуємо оригінальний об'єкт
        scheduler = params_dict.get("scheduler", "normal")  # Отримуємо оригінальний об'єкт
        positive_tag = params_dict.get("positive_tag", "")
        negative_tag = params_dict.get("negative_tag", "")
        
        # Повертаємо оригінальні об'єкти, а не їх рядкові представлення
        return (model, clip, vae, steps, cfg, 
                sampler_name, scheduler,  # Без конвертації в str
                positive_tag, negative_tag, params_pipe)

# --- Node 3: ListSelectorNode ---
class ListSelectorNode:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                # Input for multiline text where each line is a list item
                "list_items": ("STRING", {"multiline": True, "default": "Item 1\nItem 2\nItem 3"}),
                # Input for selecting the item's number (1-based index)
                "index": ("INT", {"default": 1, "min": 1, "max": 10000, "step": 1}),
            }
        }
    # Return types: selected string and its number
    RETURN_TYPES = ("STRING", "INT")
    # Output names
    RETURN_NAMES = ("selected_item", "selected_index")
    FUNCTION = "get_item_by_index"
    CATEGORY = "MultiModel" # Category for the node
    
    def get_item_by_index(self, list_items, index):
        # Split the input text into lines
        lines = list_items.splitlines()
        # Filter out empty lines and trim unnecessary spaces
        items = [line.strip() for line in lines if line.strip()]
        selected_item_str = ""
        selected_item_index = 1 # Default to the first item
        
        if not items:
            # If the list is empty after filtering
            print("Warning: ListSelectorNode - Input list is empty.")
            selected_item_str = ""
            selected_item_index = 1 # Nothing to select, return index 1
        else:
            # Adjust the 1-based input index to 0-based for Python list access
            zero_based_index = index - 1
            # Check if the index is within bounds
            # If index is too small (<0), use 0
            if zero_based_index < 0:
                zero_based_index = 0
            # If index is too large, use the index of the last item
            elif zero_based_index >= len(items):
                zero_based_index = len(items) - 1
            # Get the selected item
            selected_item_str = items[zero_based_index]
            # Determine the actual 1-based index of the selected item
            selected_item_index = zero_based_index + 1
            
        # Return the selected string and its 1-based index
        return (selected_item_str, selected_item_index)

class DenoiseSelector:
    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {
                "denoise": ("FLOAT", {"default": 0.5, "min": 0.0, "max": 1.0, "step": 0.01}),
            }
        }
    
    RETURN_TYPES = ("FLOAT",)
    RETURN_NAMES = ("denoise",)
    FUNCTION = "select_denoise"
    CATEGORY = "MultiModel"
    
    def select_denoise(self, denoise):
        return (denoise,)

# --- Наша існуюча нода KSamplerPipeNode ---
class KSamplerPipeNode:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "params_pipe": (PIPE_TYPE_NAME,),
                # "latent": ("LATENT",), # Переміщено до optional
                "positive": ("CONDITIONING",),
                "negative": ("CONDITIONING",),
                "seed": ("INT", {"default": 0, "min": 0, "max": 0xffffffffffffffff}),
                "denoise": ("FLOAT", {"default": 1.0, "min": 0.0, "max": 1.0, "step": 0.01}),
            },
            "optional": {
                 "latent": ("LATENT",), # Тепер опціональний
                 "image_override": ("IMAGE",)
            }
        }

    RETURN_TYPES = (PIPE_TYPE_NAME, "IMAGE")
    RETURN_NAMES = ("params_pipe", "image")
    FUNCTION = "sample"
    CATEGORY = "MultiModel"

    def sample(self, params_pipe, positive, negative, seed, denoise, latent=None, image_override=None):
        if latent is not None and image_override is not None:
            raise ValueError("Both 'latent' and 'image_override' inputs are connected. Please connect only one.")
        if latent is None and image_override is None:
            raise ValueError("Either 'latent' or 'image_override' input must be provided to KSamplerPipeNode.")

        if not isinstance(params_pipe, tuple) or len(params_pipe) != 4:
            raise ValueError(f"KSamplerPipeNode: Expected PARAMS_PIPE tuple of length 4, but got: {type(params_pipe)}")
        
        model, clip, vae, params_dict = params_pipe
        if not isinstance(params_dict, dict):
            raise ValueError(f"KSamplerPipeNode: Expected dict as the 4th element in PARAMS_PIPE, but got: {type(params_dict)}")

        # Отримуємо параметри з params_pipe
        steps = params_dict.get("steps", 20)
        cfg = params_dict.get("cfg", 7.0)
        sampler_name = params_dict.get("sampler_name", "euler_ancestral")
        scheduler = params_dict.get("scheduler", "normal")

        # Визначаємо, який латент використовувати
        if image_override is not None:
            print("KSamplerPipeNode: Using image_override input.")
            if vae is None:
                 raise ValueError("VAE is required to encode image_override, but it's missing in the params_pipe.")
            encoded_samples = vae.encode(image_override[:,:,:,:3])
            latent_input = {"samples": encoded_samples}
        else: # image_override is None, тому використовуємо latent (ми вже перевірили, що він не None)
            print("KSamplerPipeNode: Using latent input.")
            latent_input = latent 

        # Використовуємо common_ksampler
        latent_result = common_ksampler(model, seed, steps, cfg, sampler_name, scheduler, positive, negative, latent_input, denoise=denoise)[0]
        
        # Декодуємо зображення
        if vae is None:
             raise ValueError("VAE is required for decoding the result, but it's missing in the params_pipe.")
        image = vae.decode(latent_result["samples"])
        
        return (params_pipe, image)

# --- Нова нода PromptBuilderNode ---
class PromptBuilderNode:
    @classmethod
    def INPUT_TYPES(cls):
        style_files = get_style_files() # Ця функція все ще повертає список з "None"
        # Ми більше не використовуємо get_style_names для початкового списку тут

        return {
            "required": {
                "params_pipe": (PIPE_TYPE_NAME,),
                "positive_base": ("STRING", {"multiline": True, "default": ""}),
                "negative_base": ("STRING", {"multiline": True, "default": ""}),
            },
            "optional": {
                "from_IMG2TXT": ("STRING", {"multiline": True, "default": "", "forceInput": True}), 
                "style_file": (style_files, ), 
                # Змінюємо default на порожній рядок, оскільки "None" більше не буде опцією
                "style_name": ("STRING", {"default": "", "multiline": False}), 
            }
        }

    RETURN_TYPES = ("STRING", "STRING", "CONDITIONING", "CONDITIONING")
    RETURN_NAMES = ("positive_text", "negative_text", "positive_prompt", "negative_prompt")
    FUNCTION = "build_prompts"
    CATEGORY = "MultiModel"

    @classmethod
    def IS_CHANGED(cls, *args, **kwargs):
        # Використовуємо *args, **kwargs, щоб уникнути помилок з аргументами
        return float("NaN") 

    def build_prompts(self, params_pipe, positive_base, negative_base, from_IMG2TXT=None, style_file="None", style_name="None"):
        # 1. Розпаковка params_pipe
        if not isinstance(params_pipe, tuple) or len(params_pipe) != 4:
            raise ValueError("PromptBuilderNode: Invalid params_pipe structure.")
        model, clip, vae, params_dict = params_pipe
        if not isinstance(params_dict, dict):
            raise ValueError("PromptBuilderNode: Invalid params_dict in params_pipe.")
        if clip is None:
             raise ValueError("PromptBuilderNode: CLIP object is missing in the params_pipe.")

        # 2. Отримання тегів з pipe
        positive_tags = params_dict.get("positive_tag", "").strip()
        negative_tags = params_dict.get("negative_tag", "").strip()

        # Очищення вхідного тексту з вузла
        safe_from_img2txt = "" if from_IMG2TXT is None else from_IMG2TXT.strip()
        safe_positive_base = "" if positive_base is None else positive_base.strip()
        safe_negative_base = "" if negative_base is None else negative_base.strip()

        style_prompt_template = "{prompt}" # Default template
        style_negative_prompt = "" # Default negative from style

        # 3. Обробка стилю (отримання шаблонів)
        if style_file != "None" and style_name != "None":
            styles_dir = get_styles_dir()
            filepath = os.path.join(styles_dir, style_file)
            try:
                if os.path.isfile(filepath):
                    if filepath.endswith('.yaml') or filepath.endswith('.yml'):
                        with open(filepath, 'r', encoding='utf-8') as f:
                            styles_data = yaml.safe_load(f)
                    else:
                        with open(filepath, 'r', encoding='utf-8') as f:
                            styles_data = json.load(f)
                    if isinstance(styles_data, list):
                        selected_style = next((s for s in styles_data if isinstance(s, dict) and s.get("name") == style_name), None)
                        if selected_style:
                            style_prompt_template = selected_style.get("prompt", "{prompt}")
                            style_negative_prompt = selected_style.get("negative_prompt", "")
                        else:
                            print(f"Warning: Style '{style_name}' not found in {style_file}.")
            except Exception as e:
                print(f"Error processing style file {style_file}: {e}")

        # 4. Формування позитивного тексту (НОВИЙ ПОРЯДОК)
        # Спочатку збираємо теги, базу та img2txt
        core_positive_parts = []
        if positive_tags:
            core_positive_parts.append(positive_tags)
        if safe_positive_base:
            core_positive_parts.append(safe_positive_base)
        if safe_from_img2txt:
            core_positive_parts.append(safe_from_img2txt)
        core_prompt = ". ".join(filter(None, core_positive_parts))

        # Тепер вставляємо зібраний core_prompt у шаблон стилю
        final_positive_text = style_prompt_template.replace("{prompt}", core_prompt) if core_prompt else style_prompt_template.replace("{prompt}", "")
        # Додатково очистимо кінцевий результат від зайвих пробілів
        final_positive_text = final_positive_text.strip()

        # 5. Формування негативного тексту (ЗМІНЕНО ПОРЯДОК)
        # Спочатку збираємо базу і стиль
        negative_base_and_style_parts = []
        if safe_negative_base:
            negative_base_and_style_parts.append(safe_negative_base)
        if style_negative_prompt:
             negative_base_and_style_parts.append(style_negative_prompt)
        base_and_style_negative = ". ".join(filter(None, negative_base_and_style_parts))
        
        # Тепер збираємо фінальний негативний, ставлячи теги першими
        final_negative_parts = []
        if negative_tags:
            final_negative_parts.append(negative_tags)
        if base_and_style_negative:
             final_negative_parts.append(base_and_style_negative)
        final_negative_text = ". ".join(filter(None, final_negative_parts))

        # 6 & 7. Кодування промптів (залишається без змін)
        tokens_positive = clip.tokenize(final_positive_text)
        cond_positive, pooled_positive = clip.encode_from_tokens(tokens_positive, return_pooled=True)

        tokens_negative = clip.tokenize(final_negative_text)
        cond_negative, pooled_negative = clip.encode_from_tokens(tokens_negative, return_pooled=True)

        # 8. Повернення результатів (залишається без змін)
        return (final_positive_text, final_negative_text, 
                [[cond_positive, {"pooled_output": pooled_positive}]], 
                [[cond_negative, {"pooled_output": pooled_negative}]])

# --- Новий вузол-байпасер для ModelParamsPipeNode ---
class ActiveModel:
    # Цьому вузлу не потрібні входи чи виходи, визначені в Python,
    # оскільки вся логіка відбувається в JavaScript.
    @classmethod
    def INPUT_TYPES(cls):
        return {"required": {}}

    RETURN_TYPES = ()
    FUNCTION = "do_nothing" # Потрібно вказати функцію, навіть якщо вона нічого не робить
    OUTPUT_NODE = True # Вказує, що вузол може не мати виходів або має особливу логіку
    CATEGORY = "MultiModel" # Змінюємо категорію на основну категорію

    def do_nothing(self):
        # Ця функція ніколи не буде викликана, якщо JS обробляє дії,
        # але вона потрібна для реєстрації.
        return ()

# --- API Endpoint for Dynamic Styles ---
@PromptServer.instance.routes.post('/multi_model/get_style_names')
async def get_style_names_endpoint(request):
    # print("--- API Endpoint /multi_model/get_style_names called ---") # Keep this commented for less verbose logs
    try:
        json_data = await request.json()
        filename = json_data.get('filename')

        if filename is None: # Check explicitly for None, as empty string might be valid (though unlikely here)
            print("API Error: Filename not provided in request")
            return web.Response(status=400, text="Filename not provided")

        style_names = get_style_names(filename)
        # print(f"Returning style names for {filename}: {style_names}") # Keep commented
        return web.json_response({"style_names": style_names})
    
    except json.JSONDecodeError as json_err:
        try:
             raw_body = await request.read()
             body_text = raw_body.decode('utf-8', errors='ignore')
        except Exception:
             body_text = "[Could not read body]"
        print(f"API Error: Invalid JSON received. Body: {body_text}. Error: {json_err}")
        return web.Response(status=400, text=f"Invalid JSON received: {json_err}")
    except Exception as e:
        print(f"API Error in get_style_names_endpoint: {e}")
        import traceback
        print(traceback.format_exc())
        return web.Response(status=500, text=f"Internal server error: {e}")

# --- Helper definitions for MySwitchIndex ---
class AnyType(str):
  """A special class that is always equal in not equal comparisons. Credit to pythongosssss"""

  def __ne__(self, __value: object) -> bool:
    return False

class FlexibleOptionalInputType(dict):
  """A special class to make flexible nodes that pass data to our python handlers.

  Enables both flexible/dynamic input types (like for Any Switch) or a dynamic number of inputs
  (like for Any Switch, Context Switch, Context Merge, Power Lora Loader, etc).
  """
  def __init__(self, type):
    self.type = type

  def __getitem__(self, key):
    # Allow specific named inputs if needed, otherwise default to the flexible type
    # Returning the flexible type tuple for __contains__ to work seamlessly
    return (self.type,)


  def __contains__(self, key):
      # We accept any key starting with 'input_'
      return key.startswith('input_')


any_type_switch = AnyType("*") # Using a different variable name to avoid conflicts

def is_context_empty(ctx):
  """Checks if the provided ctx is None or contains just None values."""
  return not ctx or all(v is None for v in ctx.values())

def is_none(value):
  """Checks if a value is none. Adapted from rgthree."""
  if value is not None:
    # Handle rgthree context specifically if needed, or remove if not applicable
    if isinstance(value, dict) and 'model' in value and 'clip' in value:
      return is_context_empty(value)
  return value is None

# --- Node: MySwitchIndex ---
class MySwitchIndex:
  """
  A node that takes multiple inputs and outputs the first non-empty one
  along with its index (firstActive mode) OR outputs the input at a specific index.
  Inputs are dynamically managed by the frontend.
  """

  # Set NAME and CATEGORY directly
  NAME = "Multi Model Switch"
  CATEGORY = "MultiModel"

  @classmethod
  def INPUT_TYPES(cls):
    return {
      "required": {
          "mode": (["firstActive", "index"], ),
          # Оновлюємо min та default для 1-базованого індексу
          "index": ("INT", {"default": 1, "min": 1, "max": 999}), 
      },
      "optional": FlexibleOptionalInputType(any_type_switch),
    }

  # Output the selected value and its index
  RETURN_TYPES = (any_type_switch, "INT",)
  RETURN_NAMES = ("selected_value", "selected_index",)

  FUNCTION = "switch_index"

  # Змінюємо сигнатуру: приймаємо всі входи через **kwargs
  def switch_index(self, **kwargs): 
    """
    Selects and returns an input value and its 1-based index based on the selected mode.
    - firstActive: Returns the first non-none input.
    - index: Returns the input at the specified 1-based index from the widget.
    Returns 0 for selected_index if no active input is found.
    """
    # Витягуємо mode та index_from_widget з kwargs
    mode = kwargs.get("mode", "firstActive") # За замовчуванням firstActive
    # Отримуємо 1-базований індекс з віджета, за замовчуванням 1
    index_from_widget = kwargs.get("index", 1) 
    
    selected_value = None
    # Внутрішній індекс буде 0-базованим, або -1 якщо не знайдено
    internal_selected_index = -1 

    if mode == "firstActive":
        input_items = []
        # Проходимо по всіх kwargs, щоб знайти динамічні входи
        for key, value in kwargs.items():
            if key.startswith("input_"):
                try:
                    # Assume 1-based index in name from frontend, store 0-based
                    key_index_0_based = int(key.split('_')[-1]) - 1 
                    input_items.append({'index': key_index_0_based, 'key': key, 'value': value})
                except ValueError:
                    print(f"[MultiModelSwitch] Warning: Could not parse index from key '{key}'")
                    continue

        # Sort by index parsed from the key name
        input_items.sort(key=lambda item: item['index'])

        for item in input_items:
            if not is_none(item['value']):
                selected_value = item['value']
                internal_selected_index = item['index'] # Store the 0-based index
                break
        
    elif mode == "index":
        # index_from_widget тепер 1-базований
        target_key = f"input_{index_from_widget}" # Ключ будується з 1-базованого індексу
        # Перевіряємо наявність ключа та значення в kwargs
        if target_key in kwargs: 
             input_value = kwargs[target_key]
             if not is_none(input_value):
                 selected_value = input_value
                 # Зберігаємо внутрішній 0-базований індекс
                 internal_selected_index = index_from_widget - 1 
        
    else:
         print(f"[MultiModelSwitch] Warning: Unknown mode '{mode}'")

    # Конвертуємо 0-базований внутрішній індекс в 1-базований для виходу, або 0 якщо не знайдено
    output_index = internal_selected_index + 1 if internal_selected_index != -1 else 0

    return (selected_value, output_index,)

# --- Node Mappings ---
NODE_CLASS_MAPPINGS = {
    "ModelParamsPipe": ModelParamsPipeNode,
    "ParamsPipeUnpack": ParamsPipeUnpack,
    "ListSelector": ListSelectorNode,
    "DenoiseSelector": DenoiseSelector,
    "KSamplerPipe": KSamplerPipeNode,
    "PromptBuilder": PromptBuilderNode,
    "ActiveModel": ActiveModel,
    "MySwitchIndex": MySwitchIndex, # Register the new node
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "ModelParamsPipe": "Model Parameters Pipe",
    "ParamsPipeUnpack": "Unpack Parameters Pipe",
    "ListSelector": "List Selector",
    "DenoiseSelector": "Denoise Selector",
    "KSamplerPipe": "KSampler (Pipe)",
    "PromptBuilder": "Prompt Builder",
    "ActiveModel": "Active Model",
    "MySwitchIndex": "Multi Model Switch", # Оновлено відображуване ім'я
}

print("✅ Loaded ModelParamsNode.py with all nodes (*^_^*)")