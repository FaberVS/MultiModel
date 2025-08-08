import traceback

# Ініціалізація порожніх словників
NODE_CLASS_MAPPINGS = {}
NODE_DISPLAY_NAME_MAPPINGS = {}

try:
    # Спробуємо імпортувати ноди з ModelParamsNode.py
    from .ModelParamsNode import NODE_CLASS_MAPPINGS as MODEL_NODE_CLASS_MAPPINGS
    from .ModelParamsNode import NODE_DISPLAY_NAME_MAPPINGS as MODEL_NODE_DISPLAY_NAME_MAPPINGS
    
    # Оновлення словників даними з ModelParamsNode.py
    NODE_CLASS_MAPPINGS.update(MODEL_NODE_CLASS_MAPPINGS)
    NODE_DISPLAY_NAME_MAPPINGS.update(MODEL_NODE_DISPLAY_NAME_MAPPINGS)

except ImportError as e:
    pass
except Exception as e:
    pass

# Вказуємо ComfyUI, що в папці js є веб-файли
WEB_DIRECTORY = "js"