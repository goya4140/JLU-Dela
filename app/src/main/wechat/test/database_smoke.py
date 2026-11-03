import hashlib
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import tempfile
from sqlcipher3 import dbapi2 as sqlite
import zstandard


root = Path(__file__).resolve().parents[4]
runtime = root / ".build/wechat-reader"
reader = runtime / "rion_wechat_reader.py"
bridge = root / "src/main/wechat/native/database.py"
python = runtime / "venv/bin/python"
chat = "synthetic-dela@chatroom"
key = os.urandom(32).hex()


with tempfile.TemporaryDirectory(prefix="dela-wechat-database-") as directory:
    directory = Path(directory)
    paths = []
    connections = []
    for name in ("session.db", "contact.db", "message_0.db", "message_1.db"):
        path = directory / name
        conn = sqlite.connect(str(path))
        conn.execute(f"PRAGMA key=\"x'{key}'\"")
        paths.append(path)
        connections.append(conn)
    session, contact, first, second = connections
    session.execute("CREATE TABLE SessionTable(username TEXT, last_timestamp INTEGER)")
    contact.execute("CREATE TABLE contact(username TEXT, nick_name TEXT, remark TEXT)")
    contact.executemany(
        "INSERT INTO contact VALUES (?,?,?)",
        [(chat, "JLU-Dela", ""), ("synthetic-sender", "虚构同学", "")],
    )
    for conn in (first, second):
        conn.execute("PRAGMA journal_mode=WAL")
        conn.execute("CREATE TABLE Name2Id(user_name TEXT)")
        conn.execute("INSERT INTO Name2Id VALUES ('synthetic-sender')")
        for username in (chat, "other@chatroom"):
            table = "Msg_" + hashlib.md5(username.encode()).hexdigest()
            conn.execute(
                f'CREATE TABLE "{table}"(local_id INTEGER, local_type INTEGER, real_sender_id INTEGER, create_time INTEGER, message_content BLOB, WCDB_CT_message_content INTEGER)'
            )
            text = (
                "绝不能混入其他群" if username != chat else "真实读取链路的虚构加密样本"
            )
            conn.execute(
                f'INSERT INTO "{table}" VALUES (1,1,1,1793660400,?,4)',
                (zstandard.ZstdCompressor().compress(text.encode()),),
            )
        conn.commit()
    session.commit()
    contact.commit()
    keys = directory / "keys.json"
    salts = {path.read_bytes()[:16].hex(): key for path in paths}
    keys.write_text(json.dumps({"schema_version": 2, "salt_keys": salts}))
    keys.chmod(0o600)
    config = directory / "config.json"
    config.write_text(
        json.dumps(
            {
                "session_db": str(paths[0]),
                "contact_db": str(paths[1]),
                "message_dbs": [str(path) for path in paths[2:]],
                "keys_file": str(keys),
            }
        )
    )
    config.chmod(0o600)

    def snapshot():
        return {
            str(path): hashlib.sha256(path.read_bytes()).hexdigest()
            for path in directory.iterdir()
            if path.name.endswith((".db", "-wal", "-shm"))
        }

    def read():
        return json.loads(
            subprocess.check_output(
                [
                    str(python),
                    str(bridge),
                    "--reader",
                    str(reader),
                    "--config",
                    str(config),
                ]
            )
        )

    before = snapshot()
    result = read()
    assert result["phase"] == "ready", result
    assert result["chatId"] == chat
    assert len(result["messages"]) == 2
    assert (
        len({item["id"] for item in result["messages"]}) == 2
    ), "分片 local_id 不可碰撞"
    assert all(
        item["text"] == "真实读取链路的虚构加密样本" for item in result["messages"]
    )
    assert snapshot() == before, "读取不得改写源数据库或 WAL/SHM"
    assert read() == result, "重复读取标识应稳定"
    table = "Msg_" + hashlib.md5(chat.encode()).hexdigest()
    first.execute(
        f'INSERT INTO "{table}" VALUES (2,1,1,1793660401,?,0)', ("WAL 中的新消息",)
    )
    first.commit()
    before = snapshot()
    assert len(read()["messages"]) == 3, "应读取尚未 checkpoint 的 WAL 新消息"
    assert snapshot() == before
    contact.execute("INSERT INTO contact VALUES ('ambiguous@chatroom','JLU-Dela','')")
    contact.commit()
    assert read() == {"phase": "ambiguous"}, "同名群不得猜测"
    contact.execute("DELETE FROM contact WHERE nick_name='JLU-Dela'")
    contact.commit()
    assert read() == {"phase": "group-not-found"}
    for conn in connections:
        conn.close()
print(
    "Encrypted database smoke passed: exact group scope, schema-2 keys, WCDB compression, WAL, shard identities, repeat reads and unchanged sources. Synthetic data only."
)
