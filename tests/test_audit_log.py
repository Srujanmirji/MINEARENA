"""Append-only, hash-chained audit log (PS 3.8). Uses a throwaway database."""
import sqlite3
import tempfile
import unittest
from pathlib import Path

import audit.log as log


class TestAuditLog(unittest.TestCase):
    def setUp(self):
        self._old = log.DB_PATH
        log.DB_PATH = Path(tempfile.mkdtemp()) / "audit_test.db"

    def tearDown(self):
        log.DB_PATH = self._old

    def entry(self, metric: str, **extra) -> dict:
        return {"decision_id": f"T:acc:{metric}", "thread_id": "T", "value_id": f"acc:{metric}",
                "original_value": 1, "decision": "auto_approved", **extra}

    def test_chain_verifies_and_duplicate_is_a_no_op(self):
        first = log.append(self.entry("revenue"))
        log.append(self.entry("cash"))
        self.assertEqual(log.append(self.entry("revenue", reviewer="someone")), first)
        self.assertEqual(log.verify_chain(), {"ok": True, "rows": 2, "broken_at_seq": None})

    def test_update_and_delete_are_refused(self):
        log.append(self.entry("revenue"))
        conn = sqlite3.connect(log.DB_PATH)
        for sql in ("UPDATE audit_log SET decision='approved'", "DELETE FROM audit_log"):
            with self.assertRaises(sqlite3.IntegrityError):
                conn.execute(sql)
        conn.close()

    def test_tampering_breaks_the_chain(self):
        log.append(self.entry("revenue"))
        log.append(self.entry("cash"))
        conn = sqlite3.connect(log.DB_PATH, isolation_level=None)
        conn.executescript("DROP TRIGGER audit_no_update; UPDATE audit_log SET original_value = 99 WHERE seq = 1;")
        conn.close()
        self.assertEqual(log.verify_chain()["broken_at_seq"], 1)

    def test_incomplete_decisions_are_refused(self):
        with self.assertRaises(ValueError):
            log.append({"decision_id": "T:a:x", "thread_id": "T", "value_id": "a:x", "action": "correct", "note": "n"})
        with self.assertRaises(ValueError):
            log.append({"decision_id": "T:a:x", "thread_id": "T", "value_id": "a:x", "action": "reject"})


if __name__ == "__main__":
    unittest.main()
