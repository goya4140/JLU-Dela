import argparse
import hashlib
import importlib.util
import json
from pathlib import Path


def read_group(reader_path, config_path):
    if not config_path.is_file():
        return {"phase": "needs-access"}
    spec = importlib.util.spec_from_file_location("dela_wechat_reader", reader_path)
    reader = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(reader)
    db = reader.DatabaseSet(config_path)
    if not db.configured():
        return {"phase": "needs-access"}
    candidates = reader.resolve_chat(db, "JLU-Dela", "group", 100)
    matches = [
        item
        for item in candidates
        if item["username"].endswith("@chatroom")
        and "JLU-Dela" in (item.get("nick_name"), item.get("remark"))
    ]
    if len(matches) != 1:
        return {"phase": "ambiguous" if matches else "group-not-found"}
    chat_id = matches[0]["username"]
    account = hashlib.sha256(str(db.session_db.resolve()).encode()).hexdigest()
    rows = []
    sources = db.message_dbs
    try:
        for source in sources:
            db.message_dbs = [source]
            for item in reader.timeline(db, chat_id, 200, 0, None, None):
                identity = (
                    f"{account}\n{chat_id}\n{source.resolve()}\n{item['local_id']}"
                )
                rows.append(
                    {
                        "id": hashlib.sha256(identity.encode()).hexdigest(),
                        "text": item["text"],
                        "sender": item["sender"],
                        "sentAt": item["time"],
                        "kind": item["kind_name"],
                    }
                )
    finally:
        db.message_dbs = sources
    rows.sort(key=lambda item: (item["sentAt"], item["id"]))
    return {
        "phase": "ready",
        "account": account,
        "chatId": chat_id,
        "messages": rows[-200:],
    }


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--reader", type=Path, required=True)
    parser.add_argument("--config", type=Path, required=True)
    args = parser.parse_args()
    try:
        result = read_group(args.reader, args.config)
    except Exception:
        result = {"phase": "error"}
    print(json.dumps(result, ensure_ascii=True))
