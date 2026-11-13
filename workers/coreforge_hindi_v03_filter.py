#!/usr/bin/env python3
"""Filter prepared CoreForge Hindi research data for v0.3.
Research-only heuristic filtering, never a substitute for human review.
Preserves source attribution and rehashes splits for the existing trainer.
"""
import argparse, csv, hashlib, json, random, re
from collections import Counter
from pathlib import Path

def rows(path):
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]

def repeated(text):
    words=re.findall(r"\S+",text.casefold())
    if len(words)<12:return False
    for n in (2,3,4):
        grams=[tuple(words[i:i+n]) for i in range(len(words)-n+1)]
        if grams and max(Counter(grams).values())>=max(5,len(grams)*0.3):return True
    return False

def main():
    a=argparse.ArgumentParser()
    a.add_argument("--input",required=True)
    a.add_argument("--output",required=True)
    a.add_argument("--sample",type=int,default=40)
    args=a.parse_args()
    source=Path(args.input)
    target=Path(args.output)
    target.mkdir(parents=True,exist_ok=True)
    accepted={k:[] for k in ("train","validation","test")}
    counter=Counter()
    seen_questions=set()
    for split in accepted:
        for row in rows(source/f"{split}.jsonl"):
            counter["scanned"]+=1
            messages=row["messages"]
            question=messages[-2]["content"].strip()
            answer=messages[-1]["content"].strip()
            question_key=hashlib.sha256(re.sub(r"\s+"," ",question.casefold()).encode()).hexdigest()
            if question_key in seen_questions:
                counter["duplicate_prompt"]+=1
                continue
            if repeated(answer) or repeated(question):
                counter["repetitive"]+=1
                continue
            if len(answer)<40 or len(question)<20:
                counter["too_short"]+=1
                continue
            combined=question+" "+answer
            if row.get("language")=="hi" and sum("\u0900"<=ch<="\u097f" for ch in answer)<15:
                counter["low_hindi_script"]+=1
                continue
            seen_questions.add(question_key)
            accepted[split].append(row)
            counter["kept"]+=1
    if not accepted["train"] or not accepted["validation"] or not accepted["test"]:
        raise ValueError("Empty filtered split, inspect dataset")
    # Hash the same serialization as coreforge_chat_data.dataset_hash.
    from coreforge_chat_data import dataset_hash
    for split, data in accepted.items():
        (target/f"{split}.jsonl").write_text("".join(json.dumps(row,ensure_ascii=False)+"\n" for row in data),encoding="utf-8")
    src_manifest=json.loads((source/"manifest.json").read_text(encoding="utf-8"))
    src_manifest.update({
        "dataset_purpose":"CoreForge Hindi AI v0.3 research only",
        "prepared_count":sum(map(len,accepted.values())),
        "splits":{k:len(v) for k,v in accepted.items()},
        "sha256":{k:dataset_hash(v) for k,v in accepted.items()},
        "filtering":{"type":"heuristic_repetition_prompt_dedupe_language","counts":dict(counter)},
        "production_approval":False,
        "note":"Heuristics are incomplete. Manual QA and license/privacy review required before production."
    })
    (target/"manifest.json").write_text(json.dumps(src_manifest,ensure_ascii=False,indent=2),encoding="utf-8")
    random.seed(3407)
    review=random.sample(accepted["train"],min(max(1,args.sample),len(accepted["train"])))
    with (target/"manual_review.csv").open("w",encoding="utf-8",newline="") as f:
        w=csv.writer(f)
        w.writerow(["source","quality_type","user_prompt","assistant_answer","human_approved","review_notes"])
        for row in review:
            w.writerow([row.get("source",""),row.get("quality_type",""),row["messages"][-2]["content"],row["messages"][-1]["content"],"",""])
    print(json.dumps({"splits":src_manifest["splits"],"filtering":dict(counter),"review_sample":str(target/"manual_review.csv")},ensure_ascii=False,indent=2))

if __name__=="__main__": main()
