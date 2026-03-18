import os

import pyautogui as pag
import pyperclip
from pyautogui import Point

search = Point(x=-1218, y=237)
card = Point(x=-1676, y=378)


def grab_link(title: str) -> str:
    pag.click(search)
    pag.hotkey("ctrl", "t")
    pag.typewrite("https://www.disneyplus.com/browse/search")
    pag.press("enter")
    pag.sleep(3)
    pag.click(search)
    pag.typewrite(title)
    pag.press("enter")
    pag.sleep(1)
    pag.click(card)
    pag.sleep(1)
    pag.hotkey("ctrl", "l")
    pag.hotkey("ctrl", "c")
    return pyperclip.paste()


def parse_line(line: str) -> str:
    return line.strip().split(".")[1].strip().replace("Vol-", "Vol. ")


def parse_file(file: str) -> list[str]:
    with open(os.path.join(os.path.dirname(__file__), file), "r") as f:
        return [parse_line(line) for line in f.readlines()]


def main():
    with open(os.path.join(os.path.dirname(__file__), "links.txt"), "w") as f:
        for title in parse_file("movies.txt"):
            link = grab_link(title)
            print(f"{title}: {link}")
            f.write(f"{title}: {link}\n")


if __name__ == "__main__":
    main()
