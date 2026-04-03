from __future__ import annotations

import unittest

from orion.backend.services.latex_subagent import LatexFormattingSubagent


class LatexSubagentTests(unittest.TestCase):
    def setUp(self):
        self.subagent = LatexFormattingSubagent()

    def test_normalizes_parenthesis_delimiters(self):
        result = self.subagent.refine(r"Estimate \(\pi\) from repeated trials.")
        self.assertIn(r"$\pi$", result.answer)

    def test_wraps_standalone_latex_command(self):
        result = self.subagent.refine(r"The expected value is \mu and variance \sigma^2.")
        self.assertIn(r"$\mu$", result.answer)
        self.assertIn(r"$\sigma$", result.answer)

    def test_does_not_rewrite_fenced_code(self):
        text = "```python\nvalue = '\\\\pi'\n```\nOutside: \\pi"
        result = self.subagent.refine(text)
        self.assertIn("value = '\\\\pi'", result.answer)
        self.assertIn("Outside: $\\pi$", result.answer)


if __name__ == "__main__":
    unittest.main()
