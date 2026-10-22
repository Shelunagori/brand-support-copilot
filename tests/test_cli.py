from typer.testing import CliRunner

from app.cli import cli as ops_cli
from app.eval.__main__ import cli as eval_cli


def test_eval_cli_exposes_run_subcommand() -> None:
    out = CliRunner().invoke(eval_cli, ["run", "--help"])
    assert out.exit_code == 0 and "--models" in out.output


def test_ops_cli_commands() -> None:
    out = CliRunner().invoke(ops_cli, ["--help"])
    for cmd in ("align", "deploy", "status", "realign", "estimate", "wait-api", "smoke"):
        assert cmd in out.output
