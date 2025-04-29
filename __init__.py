import traceback

# Ініціалізація порожніх словників
NODE_CLASS_MAPPINGS = {}
NODE_DISPLAY_NAME_MAPPINGS = {}



print(f"--- Initializing MultiModel --- ")

try:
    # Спробуємо імпортувати ноди з ModelParamsNode.py
    from .ModelParamsNode import NODE_CLASS_MAPPINGS as MODEL_NODE_CLASS_MAPPINGS
    from .ModelParamsNode import NODE_DISPLAY_NAME_MAPPINGS as MODEL_NODE_DISPLAY_NAME_MAPPINGS
    
    # Оновлення словників даними з ModelParamsNode.py
    NODE_CLASS_MAPPINGS.update(MODEL_NODE_CLASS_MAPPINGS)
    NODE_DISPLAY_NAME_MAPPINGS.update(MODEL_NODE_DISPLAY_NAME_MAPPINGS)
    
    print("✅ MultiModel: Mappings imported and updated successfully.")

except ImportError as e:
    print(f"❌ MultiModel: Failed to import from ModelParamsNode. ImportError: {e}")
    print(traceback.format_exc())
except Exception as e:
    print(f"❌ MultiModel: An unexpected error occurred during initialization: {e}")
    print(traceback.format_exc())

# Видалено блок імпорту для logic.py, оскільки файли видалено

# Вказуємо ComfyUI, що в папці js є веб-файли
WEB_DIRECTORY = "js"

# Цей рядок залишиться, щоб показати, чи дійшов __init__.py до кінця
print(f"--- MultiModel initialization finished (check for errors above) --- ")