#!/usr/bin/env bash
# Собирает LibreDWG (dwg2dxf / dwgread / dwg2SVG) из исходников.
# Нужен, потому что пакета libredwg-tools в Ubuntu 24.04 нет, а среда
# выполнения эфемерная — после пересоздания контейнера сборку надо повторить.
#
# Проверено: DWG (AutoCAD 2013) -> DXF -> ezdxf читает файл корректно.
set -euo pipefail

WORKDIR="${1:-/tmp/libredwg-build}"

apt-get update -y || true
apt-get install -y gcc make autoconf automake libtool texinfo pkg-config git
python3 -m pip install --quiet ezdxf python-docx

rm -rf "$WORKDIR"
git clone --depth 1 https://github.com/LibreDWG/libredwg.git "$WORKDIR"
cd "$WORKDIR"
sh autogen.sh
./configure --disable-bindings --disable-python --enable-release --prefix=/usr/local
make -j"$(nproc)"
make install
ldconfig   # обязательно: иначе dwg2dxf не найдёт libredwg.so.0

dwg2dxf --version || true
echo "Готово. Конвертация: dwg2dxf -o plan.dxf plan.dwg"
