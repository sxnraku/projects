#!/usr/bin/env python3
"""Importa Overall/Potencial do Excel para os JSONs compactos do jogo.

O importador e deliberadamente conservador: valida todos os jogadores primeiro e
so altera os indices 6/7 de cada PlayerTuple. IDs, ordem, nome, posicao,
nacionalidade, idade e pe permanecem exatamente como estavam no jogo.

Uso:
  python scripts/import-world-ratings.py docs/ficheiro.xlsx          # validar
  python scripts/import-world-ratings.py docs/ficheiro.xlsx --write  # validar e gravar
"""

from __future__ import annotations

import argparse
import json
import os
import posixpath
import re
import sys
import zipfile
from collections import defaultdict
from pathlib import Path
from typing import Any
from xml.etree import ElementTree as ET


SHEET_NS = "http://schemas.openxmlformats.org/spreadsheetml/2006/main"
REL_NS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
PKG_REL_NS = "http://schemas.openxmlformats.org/package/2006/relationships"


def qn(local: str) -> str:
    return f"{{{SHEET_NS}}}{local}"


def column_index(reference: str) -> int:
    match = re.match(r"([A-Z]+)", reference.upper())
    if not match:
        raise ValueError(f"Referencia de celula invalida: {reference!r}")
    result = 0
    for char in match.group(1):
        result = result * 26 + ord(char) - ord("A") + 1
    return result - 1


def read_shared_strings(archive: zipfile.ZipFile) -> list[str]:
    try:
        root = ET.fromstring(archive.read("xl/sharedStrings.xml"))
    except KeyError:
        return []
    return ["".join(node.text or "" for node in item.iter(qn("t"))) for item in root]


def sheet_path(archive: zipfile.ZipFile, wanted_name: str) -> str:
    workbook = ET.fromstring(archive.read("xl/workbook.xml"))
    relationship_id: str | None = None
    for sheet in workbook.iter(qn("sheet")):
        if sheet.attrib.get("name") == wanted_name:
            relationship_id = sheet.attrib.get(f"{{{REL_NS}}}id")
            break
    if not relationship_id:
        raise ValueError(f"Folha obrigatoria nao encontrada: {wanted_name}")

    relationships = ET.fromstring(archive.read("xl/_rels/workbook.xml.rels"))
    for relationship in relationships.iter(f"{{{PKG_REL_NS}}}Relationship"):
        if relationship.attrib.get("Id") != relationship_id:
            continue
        target = relationship.attrib["Target"].replace("\\", "/")
        if target.startswith("/"):
            return target.lstrip("/")
        return posixpath.normpath(posixpath.join("xl", target))
    raise ValueError(f"Relacao da folha {wanted_name!r} nao encontrada")


def cell_value(cell: ET.Element, shared_strings: list[str]) -> Any:
    cell_type = cell.attrib.get("t")
    if cell_type == "inlineStr":
        inline = cell.find(qn("is"))
        return "" if inline is None else "".join(node.text or "" for node in inline.iter(qn("t")))

    raw = cell.findtext(qn("v"))
    if raw is None:
        return None
    if cell_type == "s":
        return shared_strings[int(raw)]
    if cell_type in {"str", "e"}:
        return raw
    if cell_type == "b":
        return raw == "1"

    number = float(raw)
    return int(number) if number.is_integer() else number


def read_sheet(archive: zipfile.ZipFile, name: str) -> list[list[Any]]:
    shared_strings = read_shared_strings(archive)
    root = ET.fromstring(archive.read(sheet_path(archive, name)))
    rows: list[list[Any]] = []
    for row in root.iter(qn("row")):
        values: dict[int, Any] = {}
        for cell in row.findall(qn("c")):
            index = column_index(cell.attrib.get("r", ""))
            values[index] = cell_value(cell, shared_strings)
        if values:
            width = max(values) + 1
            rows.append([values.get(index) for index in range(width)])
        else:
            rows.append([])
    return rows


def integer(value: Any, label: str, row_number: int) -> int:
    if isinstance(value, bool):
        raise ValueError(f"{label} invalido na linha {row_number}: {value!r}")
    try:
        parsed = float(value)
    except (TypeError, ValueError) as error:
        raise ValueError(f"{label} invalido na linha {row_number}: {value!r}") from error
    if not parsed.is_integer():
        raise ValueError(f"{label} deve ser inteiro na linha {row_number}: {value!r}")
    return int(parsed)


def workbook_players(workbook_path: Path) -> dict[int, list[dict[str, Any]]]:
    with zipfile.ZipFile(workbook_path) as archive:
        rows = read_sheet(archive, "Todos_Jogadores")
    if not rows:
        raise ValueError("A folha Todos_Jogadores esta vazia")

    header = {str(value).strip(): index for index, value in enumerate(rows[0]) if value is not None}
    required = ["ID Jogador", "ID Equipa", "Nome", "Idade", "Overall", "Potencial"]
    missing = [name for name in required if name not in header]
    if missing:
        raise ValueError(f"Colunas obrigatorias em falta: {', '.join(missing)}")

    by_team: dict[int, list[dict[str, Any]]] = defaultdict(list)
    player_ids: set[int] = set()
    for row_number, row in enumerate(rows[1:], start=2):
        if not row or all(value is None for value in row):
            continue

        def value(name: str) -> Any:
            index = header[name]
            return row[index] if index < len(row) else None

        player_id = integer(value("ID Jogador"), "ID Jogador", row_number)
        team_id = integer(value("ID Equipa"), "ID Equipa", row_number)
        age = integer(value("Idade"), "Idade", row_number)
        overall = integer(value("Overall"), "Overall", row_number)
        potential = integer(value("Potencial"), "Potencial", row_number)
        name = str(value("Nome") or "").strip()

        if player_id in player_ids:
            raise ValueError(f"ID Jogador duplicado: {player_id}")
        if not name:
            raise ValueError(f"Nome vazio na linha {row_number}")
        if not 1 <= overall <= 100 or not 1 <= potential <= 100:
            raise ValueError(f"Rating fora de 1..100 na linha {row_number}: {overall}/{potential}")
        if potential < overall:
            raise ValueError(f"Potencial inferior ao overall na linha {row_number}: {overall}/{potential}")

        player_ids.add(player_id)
        by_team[team_id].append({
            "player_id": player_id,
            "name": name,
            "age": age,
            "overall": overall,
            "potential": potential,
            "row": row_number,
        })

    if sorted(player_ids) != list(range(1, len(player_ids) + 1)):
        raise ValueError("Os IDs de jogador nao sao unicos e sequenciais desde 1")
    return dict(by_team)


def prepare_updates(
    players_dir: Path,
    excel_by_team: dict[int, list[dict[str, Any]]],
) -> tuple[dict[Path, str], dict[str, int]]:
    files = sorted(players_dir.glob("*.json"))
    if not files:
        raise ValueError(f"Nenhum JSON encontrado em {players_dir}")

    payloads: dict[Path, str] = {}
    slots: dict[int, int] = defaultdict(int)
    code_teams: set[int] = set()
    stats = {
        "files": len(files),
        "players": 0,
        "overall_changes": 0,
        "potential_changes": 0,
        "players_changed": 0,
        "files_changed": 0,
    }

    for file_path in files:
        original = file_path.read_text(encoding="utf-8")
        tuples = json.loads(original)
        if not isinstance(tuples, list):
            raise ValueError(f"O ficheiro {file_path.name} nao contem uma lista")

        file_changed = False
        for file_index, player_tuple in enumerate(tuples):
            stats["players"] += 1
            if not isinstance(player_tuple, list) or len(player_tuple) != 8:
                raise ValueError(f"PlayerTuple invalido em {file_path.name}, indice {file_index}")

            team_id = integer(player_tuple[0], "teamId", file_index)
            code_teams.add(team_id)
            slot = slots[team_id]
            slots[team_id] += 1
            excel_players = excel_by_team.get(team_id)
            if excel_players is None or slot >= len(excel_players):
                raise ValueError(f"Jogador sem correspondencia no Excel: equipa {team_id}, slot {slot}")
            excel_player = excel_players[slot]

            if player_tuple[1] != excel_player["name"]:
                raise ValueError(
                    f"Nome divergente na equipa {team_id}, slot {slot}: "
                    f"JSON={player_tuple[1]!r}, Excel={excel_player['name']!r}"
                )
            if integer(player_tuple[4], "idade JSON", file_index) != excel_player["age"]:
                raise ValueError(
                    f"Idade divergente em {excel_player['name']} (equipa {team_id}): "
                    f"JSON={player_tuple[4]}, Excel={excel_player['age']}"
                )

            overall_changed = player_tuple[6] != excel_player["overall"]
            potential_changed = player_tuple[7] != excel_player["potential"]
            stats["overall_changes"] += int(overall_changed)
            stats["potential_changes"] += int(potential_changed)
            stats["players_changed"] += int(overall_changed or potential_changed)
            file_changed = file_changed or overall_changed or potential_changed
            player_tuple[6] = excel_player["overall"]
            player_tuple[7] = excel_player["potential"]

        encoded = json.dumps(tuples, ensure_ascii=False, separators=(",", ":"))
        if encoded != original:
            payloads[file_path] = encoded
        stats["files_changed"] += int(file_changed)

    excel_teams = set(excel_by_team)
    if code_teams != excel_teams:
        missing_in_code = sorted(excel_teams - code_teams)
        missing_in_excel = sorted(code_teams - excel_teams)
        raise ValueError(
            f"Equipas divergentes. Em falta no codigo: {missing_in_code}; "
            f"em falta no Excel: {missing_in_excel}"
        )
    for team_id, excel_players in excel_by_team.items():
        if slots[team_id] != len(excel_players):
            raise ValueError(
                f"Plantel incompleto na equipa {team_id}: JSON={slots[team_id]}, Excel={len(excel_players)}"
            )
    if stats["players"] != sum(len(players) for players in excel_by_team.values()):
        raise ValueError("O total de jogadores do codigo nao coincide com o Excel")
    return payloads, stats


def atomic_write(payloads: dict[Path, str]) -> None:
    temporary_files: list[Path] = []
    try:
        for file_path, content in payloads.items():
            temporary = file_path.with_name(f".{file_path.name}.importing")
            temporary.write_text(content, encoding="utf-8", newline="")
            temporary_files.append(temporary)
        for file_path in payloads:
            temporary = file_path.with_name(f".{file_path.name}.importing")
            os.replace(temporary, file_path)
            temporary_files.remove(temporary)
    finally:
        for temporary in temporary_files:
            try:
                temporary.unlink()
            except FileNotFoundError:
                pass


def main() -> int:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")

    script_dir = Path(__file__).resolve().parent
    project_dir = script_dir.parent
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("workbook", type=Path, help="Excel com a folha Todos_Jogadores")
    parser.add_argument(
        "--players-dir",
        type=Path,
        default=project_dir / "src/core/data/world/players",
        help="Diretoria dos JSONs por pais",
    )
    parser.add_argument("--write", action="store_true", help="Grava os JSONs depois de validar tudo")
    args = parser.parse_args()

    workbook = args.workbook.resolve()
    players_dir = args.players_dir.resolve()
    if not workbook.is_file():
        raise FileNotFoundError(f"Excel nao encontrado: {workbook}")
    if not players_dir.is_dir():
        raise FileNotFoundError(f"Diretoria de jogadores nao encontrada: {players_dir}")

    excel_by_team = workbook_players(workbook)
    payloads, stats = prepare_updates(players_dir, excel_by_team)

    print(f"Excel validado: {sum(len(v) for v in excel_by_team.values())} jogadores / {len(excel_by_team)} equipas")
    print(f"JSONs validados: {stats['players']} jogadores / {stats['files']} paises")
    print(
        "Alteracoes: "
        f"{stats['players_changed']} jogadores, "
        f"{stats['overall_changes']} overalls, "
        f"{stats['potential_changes']} potenciais, "
        f"{stats['files_changed']} ficheiros"
    )
    if args.write:
        if payloads:
            atomic_write(payloads)
            print("JSONs atualizados com sucesso.")
        else:
            print("Os JSONs ja estavam sincronizados; nenhum ficheiro foi regravado.")
    else:
        print("Modo de validacao: nenhum ficheiro foi alterado. Usa --write para gravar.")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as error:
        print(f"ERRO: {error}", file=sys.stderr)
        raise SystemExit(1)
