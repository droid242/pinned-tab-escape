# Pinned Tab Escape & Protection (v2.0.0)

Ez egy kicsi, de rendkívül hasznos Chrome / Edge / Brave kiegészítő, amely megvédi és kezeli a rögzített (pinned) lapokat.

## Mit csinál?

A bővítmény három fő védelmi és kényelmi funkciót lát el:

### 1. Rögzített lap fókusz-védelme lapbezáráskor
Ha bezárod az **utolsó** nem rögzített lapot is, vagy a böngésző egy rögzített lapra akarna ugrani egy lap bezárása után:
* **Ha egyáltalán nem maradt más nem rögzített lap** az ablakban: a kiegészítő automatikusan nyit egy új, üres lapot pufferként. Ez megakadályozza, hogy rögzített lap váljon aktívvá.
* **Ha maradt még másik nem rögzített lap** az ablakban: a kiegészítő megpróbál visszaváltani a legutóbb használt (előzményben szereplő) nem rögzített lapra, vagy egy másik nyitott nem rögzített lapra, elkerülve a rögzített lapot.

### 2. Rögzített lapok helyreállítása indításkor (Kétlépcsős ellenőrzéssel)
A kiegészítő folyamatosan és észrevétlenül menti a rögzített lapjaid URL-jét és sorrendjét (a `chrome.storage.local` segítségével). 
* Ha a böngésző indításakor valamilyen hiba miatt a Chrome nem állítaná vissza a rögzített lapjaidat, a kiegészítő ezt automatikusan megteszi az indítást követő **1.5 másodpercben**, majd egy másodlagos ellenőrzést végez **4.0 másodpercben** a duplikációk elkerülésére.
* **Figyelem**: Ha te magad zársz be vagy oldasz fel (unpin) egy rögzített lapot a munkamenet során, a kiegészítő ezt megjegyzi, és a következő indításnál már nem fogja azt visszaállítani.

### 3. Navigáció eltérítése rögzített lapokról (Felülírás elleni védelem)
Ha egy rögzített lapon állsz, a kiegészítő megakadályozza, hogy a lap tartalma lecserélődjön külső navigáció miatt:
* **Külső linkek**: Ha a rögzített lapon belül (pl. Messengeren) egy külső weboldalra mutató linkre kattintasz, az automatikusan új lapon nyílik meg, a rögzített oldalad pedig érintetlen marad.
* **Címsor és könyvjelzők**: Ha a rögzített lapon állva véletlenül beírsz egy új URL-t a címsorba vagy rákattintasz egy könyvjelzőre, a kiegészítő eltéríti a navigációt: az új oldal új fülön nyílik meg, a rögzített lap pedig visszaáll a kiinduló URL-re.
* **Megengedett**: A rögzített lapon belüli (azonos domain alatti) navigáció szabadon működik (pl. Messengeren belül az üzenetek közötti váltás).
* *Tipp*: Ha szándékosan szeretnél egy rögzített lapon új oldalra navigálni, előbb oldd fel a rögzítést (unpin), navigálj el, majd rögzítsd újra a lapot.

---

## Telepítés Chrome / Edge / Brave alatt

1. Töltsd le / másold a kiegészítő fájljait egy fix mappába a gépeden.
2. Nyisd meg a böngésző kiegészítők oldalát:
   * Chrome: `chrome://extensions`
   * Edge: `edge://extensions`
   * Brave: `brave://extensions`
3. Kapcsold be a **Developer mode / Fejlesztői mód** opciót a jobb felső (vagy bal oldali) sarokban.
4. Kattints a **Load unpacked / Kicsomagolt kiterjesztés betöltése** gombra.
5. Válaszd ki azt a mappát, amelyben a `manifest.json` fájl található.

## Eltávolítás

A kiegészítők oldalon egyszerűen kattints az **Eltávolítás** gombra a "Pinned Tab Escape" kártyáján.
