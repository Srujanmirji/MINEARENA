"""Auditor's opinion check (SEC, "How to Read a 10-K", Item 8).

"Most audit reports express an unqualified opinion ... If, however, an auditor expresses a
'qualified opinion' or a 'disclaimer of opinion', investors should look carefully ...
Likewise, investors should carefully evaluate material weaknesses disclosed on internal
controls over financial reporting."

Reads only the auditor's own wording in the filed 10-K (never XBRL). Generic phrases such as
the standard definition of "material weakness" in every ICFR report are NOT red flags; only
the auditor's adverse / qualified / disclaimer wording is.
"""
import re

CHECK = "Auditor's opinion"

# The auditor's standard clean opinion on the financial statements.
CLEAN = re.compile(r"present fairly,?\s+in all material respects", re.I)
# Red-flag wording, with what it means for the reviewer.
RED_FLAGS = [
    (re.compile(r"do(?:es)? not express an opinion", re.I), "disclaimer of opinion"),
    (re.compile(r"do(?:es)? not present fairly", re.I), "adverse opinion"),
    (re.compile(r"except for the (?:effects?|possible effects?) of", re.I), "qualified opinion"),
    (re.compile(r"ha(?:s|ve) not maintained,?\s+in all material respects,?\s+effective internal control", re.I),
     "material weakness: internal control over financial reporting not effective"),
    (re.compile(r"because of the effect of the material weakness", re.I),
     "material weakness: internal control over financial reporting not effective"),
    (re.compile(r"substantial doubt about (?:its|the company['’]?s) ability to continue as a going concern", re.I),
     "going concern: substantial doubt about ability to continue"),
    (re.compile(r"have been restated to correct", re.I),
     "restatement: previously issued financial statements restated"),
]


def check_opinion(text: str) -> dict:
    """One filing-level validation result {check, severity, status, detail}."""
    flat = re.sub(r"\s+", " ", text)
    found = sorted({label for rx, label in RED_FLAGS if rx.search(flat)})
    if found:
        return {"check": CHECK, "severity": "hard", "status": "failed",
                "detail": "auditor's report: " + "; ".join(found) + ". Review the whole filing"}
    if CLEAN.search(flat):
        return {"check": CHECK, "severity": "hard", "status": "passed",
                "detail": "unqualified opinion: statements present fairly, in all material respects"}
    return {"check": CHECK, "severity": "hard", "status": "na", "detail": "auditor's report not found in the document"}


if __name__ == "__main__":
    clean = "In our opinion, the consolidated financial statements present fairly, in all material respects, ..."
    assert check_opinion(clean)["status"] == "passed"
    assert check_opinion(clean + " A material weakness is a deficiency, or a combination ...")["status"] == "passed"
    assert check_opinion("we do not express an opinion on the financial statements")["status"] == "failed"
    assert "material weakness" in check_opinion(
        "the Company has not maintained, in all material respects, effective internal control")["detail"]
    assert check_opinion("no report here")["status"] == "na"
    print("[opinion] smoke test OK")
