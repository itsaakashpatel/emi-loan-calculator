"""Where does the app rank in the Indian App Store for a search term?

Usage: python3 store/aso-rank.py "emi calculator" "sip calculator" ...

Uses Apple's public iTunes Search API (top 50 results, India storefront). Prints our position
(or >50) and the top three apps with their rating counts. Run it before a release and again two
and four weeks after, and compare. Rank also depends on downloads and ratings, not text alone.
"""
import json, urllib.request, urllib.parse, sys, time
APP=6801948279
terms=sys.argv[1:]
for t in terms:
    url="https://itunes.apple.com/search?"+urllib.parse.urlencode({"term":t,"country":"in","entity":"software","limit":50})
    try:
        d=json.load(urllib.request.urlopen(url,timeout=20))
    except Exception as e:
        print(f"{t!r}: ERR {e}"); continue
    res=d["results"]
    pos=next((i+1 for i,r in enumerate(res) if r["trackId"]==APP),None)
    top=[(r["trackName"][:34],int(r.get("userRatingCount",0))) for r in res[:3]]
    print(f"{t:<34} ours={pos or '>50':<4} top3={top}")
    time.sleep(0.4)
