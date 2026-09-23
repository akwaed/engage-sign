"""Create private draft DOCX revisions with contiguous merge placeholders.

Usage: python scripts/prepare-word-templates.py "C:/path/to/engage docs" work/revised
The exact baselines remain untouched. Outputs stay in the ignored work folder.
"""

from __future__ import annotations

import hashlib
import json
import re
import sys
from pathlib import Path
from zipfile import ZipFile

from lxml import etree

NS = {"w": "http://schemas.openxmlformats.org/wordprocessingml/2006/main"}
W = f"{{{NS['w']}}}"

EXPECTED = {
    "CA contractor agreement.docx": "36fda60c6304f9e376d388e082ef8c45f186fdbaf92c02e73bc9c785be2416d6",
    "CLS Contractual Agreement with Staff.docx": "cbcdd8681840b3091498b216d02c5c9a8851a9fb43e2f4031148954453dc02d0",
    "Engage Combined Application and Background Authorization Form.docx": "c1dfa73283a48a0c6571e7a493133046812d2c26850866a655907209ba846c9d",
    "FHP contractor agreement updated 2024.docx": "4bd7518da7be2d0a7b6fa3e4d9c1e438b1ee54c36fb579b2b3ece33cf952c4ab",
    "Medication Administration Refresher training..docx": "dc4dc6ebdeed9734fe9668579eede19464b0a73bf4c5220e9aa5e2b941c6224e",
    "Memorandum of Understanding.docx": "0e490175f64d43a19d04065ba5fd238fd35816d6cadcb8631368548d3c1c8a78",
}

SLUGS = {
    "CA contractor agreement.docx": "ca-contractor-agreement",
    "CLS Contractual Agreement with Staff.docx": "cls-contractual-agreement",
    "Engage Combined Application and Background Authorization Form.docx": "application-background-authorization",
    "FHP contractor agreement updated 2024.docx": "fhp-contractor-agreement",
    "Medication Administration Refresher training..docx": "medication-refresher-training",
    "Memorandum of Understanding.docx": "memorandum-of-understanding",
}

ROLES = {
    "CA contractor agreement.docx": ("contractor", "executive_director"),
    "CLS Contractual Agreement with Staff.docx": ("staff_or_subcontractor", "agency_authorized_signer"),
    "Engage Combined Application and Background Authorization Form.docx": ("applicant",),
    "FHP contractor agreement updated 2024.docx": ("contractor", "executive_director"),
    "Medication Administration Refresher training..docx": ("employee", "trainer_evaluator"),
    "Memorandum of Understanding.docx": ("authorizing_agent", "executive_director"),
}

# Body paragraph number -> each underline span, in document order.
LINE_FIELDS = {
    "CA contractor agreement.docx": {
        4: ["effective_date", "contractor_name", "contractor_address"],
        68: ["execution_month", "execution_day", "execution_year", "execution_year_2"],
        70: ["executive_director_signature"],
        76: ["contractor_signature"],
        80: ["contractor_printed_name"],
    },
    "CLS Contractual Agreement with Staff.docx": {
        2: ["agreement_date", "subcontractor_name", "subcontractor_address"],
        34: ["start_date"],
        59: ["agency_signature", "agency_name", "agency_title", "agency_date"],
        60: ["staff_signature", "staff_name", "staff_date"],
    },
    "FHP contractor agreement updated 2024.docx": {
        4: ["effective_date", "contractor_name"],
        70: ["executive_director_signature"],
        76: ["contractor_signature"],
    },
    "Medication Administration Refresher training..docx": {
        3: ["employee_name"],
        49: ["employee_name_title"],
        50: ["employee_signature"],
        51: ["employee_date"],
        55: ["trainer_name"],
        56: ["trainer_signature"],
        57: ["trainer_credentials"],
        58: ["trainer_date"],
    },
    "Memorandum of Understanding.docx": {28: ["executive_director_signature"]},
}

# The application has intentional blank table cells. One placeholder is added
# to each data cell, preserving its table and the legal text around it.
APPLICATION_TABLES = {
    1: {1: ["position_applied_for", "application_date"]},
    2: {1: ["applicant_legal_name", "applicant_preferred_name"], 3: ["applicant_phone", "applicant_email"]},
    3: {1: ["current_street", "current_city", "current_state", "current_zip"]},
    4: {row: [f"residence_{row}_{part}" for part in ["street", "city", "state", "zip", "from", "to"]] for row in range(1, 4)},
    5: {1: [None, "education_school", "education_state", "education_year"]},
    6: {row: [None if row == 1 else f"credential_{row}_name", f"credential_{row}_issuer", f"credential_{row}_number", f"credential_{row}_expiration"] for row in range(1, 4)},
    7: {1: ["employer_1_name", "employer_1_city_state", "employer_1_phone"], 3: ["employer_1_duties", "employer_1_supervisor", None], 5: ["employer_1_start", "employer_1_end", "employer_1_reason"]},
    8: {1: ["employer_2_name", "employer_2_city_state", "employer_2_phone"], 3: ["employer_2_duties", "employer_2_supervisor", None], 5: ["employer_2_start", "employer_2_end", "employer_2_reason"]},
    9: {1: ["employer_3_name", "employer_3_city_state", "employer_3_phone"], 3: ["employer_3_duties", "employer_3_supervisor", None], 5: ["employer_3_start", "employer_3_end", "employer_3_reason"]},
    10: {row: [f"reference_{row}_{part}" for part in ["name", "relationship", "phone", "email"]] for row in range(1, 4)},
    11: {1: ["application_signature", "application_signed_date"]},
    12: {1: ["background_legal_name", "background_other_names"], 3: ["background_dob", "background_ssn"], 5: ["background_birth_country", "background_contact"], 6: [None, "background_citizenship_detail"]},
    13: {1: ["background_height", "background_weight", "background_eye_color", "background_hair_color", "background_id_state"]},
    14: {row: [f"background_residence_{row}_{part}" for part in ["street", "city", "state", "zip", "from", "to"]] for row in range(1, 7)},
    16: {0: [None, "background_authorization_name"], 2: ["background_signature", "background_signed_date"]},
}

APPLICATION_LINES = {
    12: ["out_of_state_list"],
    16: ["relevant_experience"],
    17: ["relevant_training"],
    23: ["driver_license_state"],
}

APPLICATION_CHECKS = {
    6: "work_authorized", 7: "age_18", 11: "out_of_state",
    20: "essential_functions", 21: "driver_license", 22: "vehicle_insurance",
    36: "screening_ack", 37: "drug_test_ack", 38: "tb_ack", 39: "employment_ack",
}


def paragraph_text_nodes(paragraph):
    if paragraph.xpath(".//w:txbxContent", namespaces=NS):
        return paragraph.xpath(".//w:t[not(ancestor::w:txbxContent)]", namespaces=NS)
    return paragraph.xpath(".//w:t", namespaces=NS)


def paragraph_text(paragraph):
    return "".join(node.text or "" for node in paragraph_text_nodes(paragraph))


def replace_span(paragraph, start, end, replacement):
    """Replace a character span across runs, keeping all other run formatting."""
    nodes = paragraph_text_nodes(paragraph)
    positions = []
    for node in nodes:
        positions.extend((node, offset) for offset in range(len(node.text or "")))
    if not (0 <= start < end <= len(positions)):
        raise ValueError("Invalid Word text span")
    first_node, first_offset = positions[start]
    last_node, last_offset = positions[end - 1]
    if first_node is last_node:
        text = first_node.text or ""
        first_node.text = text[:first_offset] + replacement + text[last_offset + 1:]
        return
    first_node.text = (first_node.text or "")[:first_offset] + replacement
    seen = False
    for node in nodes:
        if node is first_node:
            seen = True
            continue
        if not seen:
            continue
        if node is last_node:
            node.text = (node.text or "")[last_offset + 1:]
            break
        node.text = ""


def replace_underlines(paragraph, names):
    text = paragraph_text(paragraph)
    matches = list(re.finditer(r"_{6,}", text))
    if len(matches) != len(names):
        raise ValueError(f"Expected {len(names)} blanks, found {len(matches)} in {text[:90]!r}")
    for match, name in reversed(list(zip(matches, names))):
        replace_span(paragraph, match.start(), match.end(), "{{" + name + "}}")


def set_empty_cell(cell, name):
    if name is None:
        return
    if "".join(cell.itertext()).strip():
        raise ValueError(f"Expected an empty cell for {name}")
    p = cell.find(f"{W}p")
    if p is None:
        p = etree.SubElement(cell, f"{W}p")
    run = etree.SubElement(p, f"{W}r")
    props = etree.SubElement(run, f"{W}rPr")
    size = etree.SubElement(props, f"{W}sz")
    size.set(f"{W}val", "14")  # seven points keeps narrow table cells readable
    text = etree.SubElement(run, f"{W}t")
    text.text = "{{" + name + "}}"


def checkbox_fields(paragraph, names):
    text = paragraph_text(paragraph)
    matches = list(re.finditer("☐", text))
    if len(matches) != len(names):
        raise ValueError(f"Expected {len(names)} checkboxes in {text[:80]!r}")
    for match, name in reversed(list(zip(matches, names))):
        replace_span(paragraph, match.start(), match.end(), "{{" + name + "}}")


def prepare(name, source, destination):
    raw = source.read_bytes()
    digest = hashlib.sha256(raw).hexdigest()
    if digest != EXPECTED[name]:
        raise ValueError(f"Baseline SHA-256 mismatch: {name}: {digest}")
    with ZipFile(source) as archive:
        content = {entry.filename: archive.read(entry.filename) for entry in archive.infolist()}
    root = etree.fromstring(content["word/document.xml"])
    body = root.find(f"{W}body")
    paragraphs = body.findall(f"{W}p")
    for index, names in LINE_FIELDS.get(name, {}).items():
        replace_underlines(paragraphs[index], names)
    if name == "Engage Combined Application and Background Authorization Form.docx":
        for index, names in APPLICATION_LINES.items():
            replace_underlines(paragraphs[index], names)
        for index, stem in APPLICATION_CHECKS.items():
            names = [f"{stem}_{side}" for side in (["ack"] if index >= 36 else ["yes", "no"])]
            checkbox_fields(paragraphs[index], names)
        tables = body.findall(f"{W}tbl")
        for table_index, row_map in APPLICATION_TABLES.items():
            rows = tables[table_index].findall(f"{W}tr")
            for row_index, names in row_map.items():
                cells = rows[row_index].findall(f"{W}tc")
                if len(cells) != len(names):
                    raise ValueError(f"Table {table_index} row {row_index} changed")
                for cell, field_name in zip(cells, names):
                    set_empty_cell(cell, field_name)
        checkbox_fields(tables[5].findall(f"{W}tr")[1].findall(f"{W}tc")[0].find(f"{W}p"),
                        [f"education_{item}" for item in ["high_school", "ged", "college", "graduate", "other"]])
        for table_index in (7, 8, 9):
            cell = tables[table_index].findall(f"{W}tr")[3].findall(f"{W}tc")[2]
            checkbox_fields(cell.find(f"{W}p"), [f"employer_{table_index - 6}_contact_yes", f"employer_{table_index - 6}_contact_no"])
        cell = tables[12].findall(f"{W}tr")[6].findall(f"{W}tc")[0]
        checkbox_fields(cell.find(f"{W}p"), ["background_citizen_yes", "background_citizen_no"])
    if name == "Memorandum of Understanding.docx":
        boxes = root.xpath(".//w:txbxContent/w:p", namespaces=NS)
        if len(boxes) < 14:
            raise ValueError("Authorizing agent signature box was not found")
        for index in (0, 9):
            replace_underlines(boxes[index], ["authorizing_agent_signature"])
        for index in (4, 13):
            replace_underlines(boxes[index], ["organization_name_address"])
    content["word/document.xml"] = etree.tostring(root, xml_declaration=True, encoding="UTF-8", standalone=True)
    destination.parent.mkdir(parents=True, exist_ok=True)
    with ZipFile(destination, "w") as archive:
        for entry_name, data in content.items():
            archive.writestr(entry_name, data)
    with ZipFile(destination) as archive:
        merged = archive.read("word/document.xml").decode("utf-8")
    fields = sorted(set(re.findall(r"\{\{([a-z][a-z0-9_]*)\}\}", merged)))
    return {"sourceSha256": digest, "revisionSha256": hashlib.sha256(destination.read_bytes()).hexdigest(), "fields": fields}


def mapping(name, field_names):
    primary, *other = ROLES[name]
    result = []
    for field_name in field_names:
        if name.startswith("CA") or name.startswith("FHP"):
            role = "executive_director" if field_name.startswith("executive_director") else primary
        elif name.startswith("CLS"):
            role = "agency_authorized_signer" if field_name.startswith("agency_") else primary
        elif name.startswith("Medication"):
            role = "trainer_evaluator" if field_name.startswith("trainer_") else primary
        elif name.startswith("Memorandum"):
            role = "executive_director" if field_name.startswith("executive_director") else primary
        else:
            role = primary
        is_signature = "signature" in field_name
        is_checkbox = (field_name.endswith(("_yes", "_no", "_ack")) or field_name.startswith("education_")
                       and field_name not in {"education_school", "education_state", "education_year"})
        is_date = ("date" in field_name or field_name.endswith(("_from", "_to", "_start", "_end", "_expiration")))
        kind = "signature" if is_signature else "checkbox" if is_checkbox else "date" if is_date else "text"
        is_admin = (name.startswith(("CA", "CLS", "FHP")) and not is_signature
                    and not field_name.startswith(("staff_", "agency_")))
        owner = "admin-fill" if is_admin else "signer" if is_signature else "participant-fill"
        result.append({
            "fieldName": field_name, "label": field_name.replace("_", " ").capitalize(),
            "fieldType": kind, "populatedBy": owner, "signerRole": role,
            "pageNumber": None, "x": None, "y": None, "width": None, "height": None,
            "required": is_signature or field_name in {"applicant_legal_name", "application_date"},
        })
    if not all(any(field["fieldType"] == "signature" and field["signerRole"] == role for field in result)
               for role in ROLES[name]):
        raise ValueError(f"Missing a required signature role in {name}")
    return result


def main():
    if len(sys.argv) != 3:
        raise SystemExit("Usage: prepare-word-templates.py SOURCE_FOLDER OUTPUT_FOLDER")
    source_dir, output_dir = (Path(arg) for arg in sys.argv[1:])
    report = {}
    for name in EXPECTED:
        path = output_dir / name
        report[name] = prepare(name, source_dir / name, path)
        (output_dir / f"{SLUGS[name]}.fields.json").write_text(
            json.dumps(mapping(name, report[name]["fields"]), indent=2), encoding="utf-8")
        print(f"{name}: {len(report[name]['fields'])} placeholders")
    (output_dir / "manifest.json").write_text(json.dumps(report, indent=2), encoding="utf-8")


if __name__ == "__main__":
    main()
