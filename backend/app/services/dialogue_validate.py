"""
Pure validator for the narrative dialogue format (gap 29).

Branch `when` grammar — deliberately tiny, never eval'd:
    <var> [+ <var> ...] <op> <int>      op in < <= > >= ==
    else                                 (last branch only)
DialoguePlayer.cs implements the same grammar at runtime.
"""
import re

from app.models.assets import DialogueTree

_WHEN = re.compile(r"^\s*([A-Za-z_]\w*(?:\s*\+\s*[A-Za-z_]\w*)*)\s*(<=|>=|==|<|>)\s*(-?\d+)\s*$")


def parse_when(expr: str) -> list[str] | None:
    """Variable names in a `when` expression, or None if it doesn't match the grammar."""
    m = _WHEN.match(expr)
    return [v.strip() for v in m.group(1).split("+")] if m else None


def validate_tree(tree: DialogueTree) -> tuple[list[str], list[str]]:
    """(errors, warnings). Errors block saving; warnings (unreachable nodes) don't."""
    errors: list[str] = []
    if not tree.nodes:
        return ["Tree has no nodes"], []

    ids: set[str] = set()
    for n in tree.nodes:
        if n.id in ids:
            errors.append(f"duplicate node id '{n.id}'")
        ids.add(n.id)

    start = tree.start or tree.nodes[0].id
    if start not in ids:
        errors.append(f"start node '{start}' does not exist")

    def target(where: str, nid: str | None) -> None:
        if nid is not None and nid not in ids:
            errors.append(f"{where}: unknown node '{nid}'")

    def var(where: str, name: str) -> None:
        if name not in tree.variables:
            errors.append(f"{where}: unknown variable '{name}' (declare it in \"variables\")")

    for n in tree.nodes:
        at = f"node '{n.id}'"
        target(f"{at} next", n.next)
        for i, c in enumerate(n.choices, 1):
            target(f"{at} choice {i}", c.next)
            for name in c.effects:
                var(f"{at} choice {i} effects", name)
        for i, b in enumerate(n.branches, 1):
            where = f"{at} branch {i}"
            target(where, b.next)
            if b.when.strip() == "else":
                if i != len(n.branches):
                    errors.append(f"{where}: 'else' must be the last branch")
                continue
            names = parse_when(b.when)
            if names is None:
                errors.append(f"{where}: bad expression '{b.when}' (use e.g. \"a + b <= -4\" or \"else\")")
            else:
                for name in names:
                    var(where, name)
        if not (n.choices or n.next or n.branches or n.ending):
            errors.append(f"{at} is a dead end: give it choices, next, branches or an ending")

    # Reachability from start (only meaningful once start exists).
    warnings: list[str] = []
    if start in ids:
        by_id = {n.id: n for n in tree.nodes}
        seen, stack = set(), [start]
        while stack:
            nid = stack.pop()
            if nid in seen or nid not in by_id:
                continue
            seen.add(nid)
            n = by_id[nid]
            stack += [c.next for c in n.choices if c.next] + [b.next for b in n.branches]
            if n.next:
                stack.append(n.next)
        warnings = [f"node '{n.id}' is unreachable from '{start}'" for n in tree.nodes if n.id not in seen]
    return errors, warnings
