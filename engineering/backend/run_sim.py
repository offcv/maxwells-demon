import requests
import time

base = "http://localhost:8000/api"
session_id = "e5fa69a2-c491-4076-90c9-c18996a90912"

res = requests.get(f"{base}/sessions/{session_id}/scheme/categories")
print("Initial Categories keep_all file_count:", res.json()["keep_all"]["file_count"])

res = requests.get(f"{base}/sessions/{session_id}/scheme/categories/keep_all/groups?page=1")
groups = res.json()["data"]

file_path = groups[0]["files"][0]["path"]
print(f"File to modify: {file_path}")

# toggle the action
current_action = groups[0]["files"][0]["action"]
next_action = "keep" if current_action == "delete" else "delete"
print(f"Setting action to: {next_action}")

res = requests.put(f"{base}/sessions/{session_id}/scheme/file-action", json={"path": file_path, "action": next_action})
print("PUT response:", res.json())

res = requests.get(f"{base}/sessions/{session_id}/scheme/categories")
print("Final Categories keep_all file_count:", res.json()["keep_all"]["file_count"])
