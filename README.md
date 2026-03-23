                                                                                                             
    ██████╗ ██████╗ ██╗███████╗███╗   ███╗                           
    ██╔══██╗██╔══██╗██║██╔════╝████╗ ████║                           
    ██████╔╝██████╔╝██║███████╗██╔████╔██║                           
    ██╔═══╝ ██╔══██╗██║╚════██║██║╚██╔╝██║                           
    ██║     ██║  ██║██║███████║██║ ╚═╝ ██║                           
    ╚═╝     ╚═╝  ╚═╝╚═╝╚══════╝╚═╝     ╚═╝ 
    
AI concierge for building software                      
Describe what you want. I'll spec it, build it, ship it.
    
---

Prism is how I finally started shipping.

If you’ve ever been excited about building something with AI and then completely lost halfway through, this is for you.

I kept hitting the same wall:
- Things started strong  
- Then got messy  
- The AI hallucinated, agreed with bad ideas, or broke things  
- And somewhere around 80 percent, everything fell apart  

I never shipped anything.

Prism fixes that.

It is an AI that does not just talk about building software. It actually handles the entire process for you.

You bring the idea.  
Prism does the rest.

No engineering knowledge required.

---

## What Prism Does

You describe what you want in plain English.

Prism turns that into real, working software by guiding it through a structured process:

| Stage | What Happens |
|-------|-------------|
| **0. Resume** | Picks up where you left off |
| **1. Understand** | Asks a few simple questions to clarify your idea |
| **2. Plan** | Thinks through how it should be built before touching code |
| **3. Build** | Actually builds it step by step |
| **4. Verify** | Checks that everything works properly |
| **5. Ship** | Finalises everything and prepares it to go live |

If you are building something visual like a website, it also:
- Designs it first  
- Reviews the design before shipping  

So you do not just get something functional. You get something that actually looks right.

---

## Why This Exists

Most AI coding tools feel magical until they do not.

They:
- Agree with everything you say  
- Do not catch bad ideas  
- Lose track of the bigger picture  
- Break when things get complex  

Prism was built to solve that.

It adds structure, memory, and discipline to the process so you can actually finish what you start.

---

## How It Works (Simple Version)

Prism acts like a small team:

- Something that understands your idea  
- Something that plans it properly  
- Something that builds it  
- Something that tests it  

All coordinated together.

You just talk to it normally.  
Everything else happens behind the scenes.

---

## What Makes It Different

### It does not rush into coding
It slows down just enough to actually understand and plan first.

### It does not forget what you are building
It keeps a living memory of your product. What it is, what has been built, and what comes next.

### It does not fall apart halfway through
Most AI tools break at around 80 percent.

Prism is designed specifically to get past that point.

### It fixes its own mistakes
If something fails, it:
- Figures out why  
- Rewrites the task  
- Tries again  

Like a real team would.

---

## Under the Hood (Light Explanation)

You do not need to understand this to use Prism, but here is the idea:

Prism separates:
- Thinking, which is the big picture decisions  
- From doing, which is the actual work  

There is an Operator that holds the full vision, and Workers that handle small, focused tasks.

This prevents the chaos that usually happens when one AI tries to do everything at once.

There is also a retry system called the Guardian pattern. If something goes wrong, Prism diagnoses the issue, adjusts, and tries again instead of failing outright.

---

## Install

### Prerequisites

- Claude Code  
- OpenSpec  
- gstack  

```bash
npm install -g @fission-ai/openspec@latest
````

---

### Setup

```bash
cp -r prism/ ~/.claude/skills/prism/
```

or:

```bash
git clone https://github.com/fraser-svg/prism.git ~/.claude/skills/prism/
```

---

## Usage

Start a Claude Code conversation:

```
/prism
```

Then just describe what you want.

---

### Examples

```
/prism
Build me a landing page for my SaaS with a waitlist form.
```

```
/prism
Create a tool that tracks my workouts.
```

```
/prism
Add dark mode to my app.
```

---

### You Stay in Control

You can always say:

* Let’s rethink this
* Change the plan
* Fix this part

Prism will move back to the right stage and continue from there.

---

## Project Structure

```
prism/
├── SKILL.md
├── VERSION
├── CHANGELOG.md
├── references/
├── hooks/
├── openspec/
├── templates/
└── app/
```

---

## The Point

Prism exists so that you do not need to be an engineer to build things anymore.

You do not need to understand:

* Architecture
* Frameworks
* Tooling

You just need ideas.

---

## One Line

Prism turns your ideas into real software without you needing to know how to build it.

---

## Licence

MIT
