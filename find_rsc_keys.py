import os

# Specifically use the path that worked in Step 225
file_path = r"C:\Users\José Carlos\AppData\Local\Temp\antigravity\brain\10905f89-ff22-44b4-bccc-a469c5f20388\.system_generated\steps\137\output.txt"

if not os.path.exists(file_path):
    print(f"Error: {file_path} does not exist.")
    exit(1)

with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

keys_to_find = ["informesMensais", "defaultValues", "pescador", "identificacaoPescador", "dadosAtividade"]

with open("context_output.txt", "w", encoding="utf-8") as out:
    for key in keys_to_find:
        idx = content.find(key)
        if idx != -1:
            out.write(f"Found '{key}' at index {idx}\n")
            # Get more context around the key
            start = max(0, idx - 2000)
            end = min(len(content), idx + 8000)
            out.write(f"Context for '{key}':\n{content[start:end]}\n\n")
        else:
            # Try escaped
            escaped_key = key.replace('"', '\\"')
            idx = content.find(escaped_key)
            if idx != -1:
                out.write(f"Found escaped '{escaped_key}' at index {idx}\n")
                start = max(0, idx - 2000)
                end = min(len(content), idx + 8000)
                out.write(f"Context:\n{content[start:end]}\n\n")
            else:
                out.write(f"Could not find '{key}' or its escaped version.\n")

print("Done.")
