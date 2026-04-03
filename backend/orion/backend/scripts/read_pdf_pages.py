from __future__ import annotations

import json
import sys

from pathlib import Path

import fitz


def main() -> int:
    if len(sys.argv) != 2:
        print("Usage: read_pdf_pages.py <pdf-path>", file=sys.stderr)
        return 2

    pdf_path = Path(sys.argv[1]).expanduser().resolve()
    if not pdf_path.exists():
        print(f"PDF file does not exist: {pdf_path}", file=sys.stderr)
        return 2

    document = None
    try:
        document = fitz.open(pdf_path)
        pages: list[dict[str, object]] = []
        for page_number, page in enumerate(document, start=1):
            pages.append(
                {
                    "page_number": page_number,
                    "text": page.get_text("text") or "",
                }
            )
        json.dump(pages, sys.stdout, ensure_ascii=True)
        return 0
    except Exception as exc:
        print(f"Unable to read PDF: {exc}", file=sys.stderr)
        return 1
    finally:
        if document is not None:
            try:
                document.close()
            except Exception:
                pass


if __name__ == "__main__":
    raise SystemExit(main())
