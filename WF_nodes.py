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
        return {"required": {
                    "denoise": ("FLOAT", {"default": 0.5, "min": 0.0, "max": 1.0, "step": 0.01}),
                    }}
    RETURN_TYPES = ("FLOAT",)
    RETURN_NAMES = ("denoise",)
    FUNCTION = "select_denoise"
    CATEGORY = "MultiModel"

    def select_denoise(self, denoise):
        return (denoise,)


class DualTextInput:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                # Text field for the first text (visible on the node)
                "text_positive": ("STRING", {"multiline": True, "default": ""}),
                 # Text field for the second text (visible on the node)
                "text_negative": ("STRING", {"multiline": True, "default": ""}),
            }
        }

    RETURN_TYPES = ("STRING", "STRING")
    RETURN_NAMES = ("pos", "neg")
    FUNCTION = "process_text"
    CATEGORY = "MultiModel"

    def process_text(self, text_positive, text_negative):
        # Return values from the fields using correct variable names
        return (text_positive, text_negative)


NODE_CLASS_MAPPINGS = {
    "DenoiseSelector": DenoiseSelector,
    "ListSelectorNode": ListSelectorNode,
    "DualTextInput": DualTextInput
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "DenoiseSelector": "Denoise Selector",
    "ListSelectorNode": "Select_from_list_by_index",
    "DualTextInput": "pos/neg text"
}
