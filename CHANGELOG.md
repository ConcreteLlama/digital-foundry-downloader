# DF Downloader Changelog



## 2.8.0 (2026-08-30)

Your downloads can now be read as well as watched. Point it at an Anthropic API key and it will write a detailed summary and a separate verdict for each video, pull the hard numbers out into a table you can actually compare - per-platform resolutions and frame rates for a console face-off, the recommended settings for a PC review - and suggest tags. It costs a few pence a video and tells you roughly what a run will cost before you spend it.

It also finds Digital Foundry's own written article for a video where one exists, links it, and reads it alongside the transcript. That matters more than it sounds: an article is written rather than transcribed, so the product names and figures in it are right, where speech-to-text mangles exactly that kind of jargon.

A new Analysis section reads across everything you have analysed rather than one video at a time - every console comparison side by side, filterable by the platforms you care about, and an index of what was covered per game.

There is also a new Backfill tool under Tools, for applying any of this to content you already have rather than only to whatever you download next: pick a set of videos and generate subtitles, analyse them, or find their articles, with a button that selects everything still missing whichever you picked. It runs as one background job you can watch and cancel, and tells you what an analysis run will cost before you start it.

Articles are also picked up on their own from now on. It checks Digital Foundry's newly published pieces periodically and attaches each to whatever video it is about, so something you download today gains its written companion when that appears next week, with nothing to press.

Downloads also play in the app itself now. Press the still at the top of a downloaded video and it opens in a player with its subtitles, and beside it one list of what is in the video - the chapters written into the file and the moments the analysis found, in the order they happen, keeping up with the video as it plays. Checking what was actually said, or jumping to the one section you care about, no longer means finding the file on disk. Skipping to the last ten minutes of a four-gigabyte Direct is immediate rather than a wait for the whole thing, since only the part being watched is sent. Whether a given file plays is down to your own machine: h.264 downloads play anywhere, while HEVC ones need a decoder from your operating system, and where that is missing the player says so and points you at the file instead of sitting there black.

### Features
- AI analysis of your content
  - A detailed summary and a separate verdict for each video, naming the specific numbers and settings rather than describing it in general terms
  - The hard numbers pulled out where the content supports it - per-platform resolutions, frame rates and modes for a console comparison, the settings table for a PC review, and a per-topic breakdown for a Q+A rather than one summary flattening several unrelated discussions
  - Where a figure was never actually stated it says so, rather than filling the gap with a plausible guess. An invented number reads exactly like a real one, which makes it worse than an honest blank
  - You choose the model - Haiku, Sonnet, Opus or Fable. Haiku is the default and the recommendation: in testing it extracted settings tables and per-platform numbers correctly at around a tenth of the cost of the larger models
  - See what a run will cost before starting it. The figure comes from a real token count rather than an estimate, and came within about 10% of actual in testing
  - Run it by hand per video, or automatically after each download. Automatic waits for subtitles to finish first, so it has a transcript to work from rather than quietly producing a thinner result
- Suggested tags, including for content you have not downloaded
  - Tagging is the one part that does not need a transcript - a title and description alone are enough to infer something useful, so it works across your whole library rather than only what you have downloaded and transcribed
  - Tags inferred from a transcript or an article are more specific and better founded than ones inferred from a title alone, and every tag records which it came from, shown next to it. A tag drawn from a title is marked, because it is a weaker claim and you may be filtering on it
  - Tags are applied as they are found rather than held for approval, and removing one takes it straight back off the content
- Digital Foundry's written articles, found and used
  - Where DF published a written companion piece for a video, it is found, linked on the content, and read alongside the transcript when analysing
  - This measurably improves the result. An article is written rather than transcribed, so its terminology, product names and figures are correct where speech-to-text reliably garbles them, and for PC reviews it often contains the settings table outright
  - A match is confirmed by checking the article embeds that exact video, not by the titles looking similar - so another article about the same game is not mistaken for this one
  - Nothing is searched for while you browse. Looking at a video does not go and ask Digital Foundry about it; that only happens when you ask, or when an analysis runs
  - If no article is found that is treated as 'not yet' rather than 'never'. Patreon content is often early access, so the article may simply not be written, and it will look again later
  - A video can have more than one article attached. The piece written about it is the main link; anything that merely includes it - a round-up, a week in review - is listed separately as related reading, and is never used as the source for an analysis, since most of its text is about something else
- Older articles are picked up on their own too, not just new ones
  - The app works backwards through Digital Foundry's archive in the background, so videos you downloaded long before setting this up gain their written companion without you going and running the Backfill tool
  - Deliberately a trickle rather than a crawl: one index and a small batch of articles per check, picking up exactly where it stopped, so a decade of archive is read over days of ordinary running instead of in one sitting
  - It stops for good once it has been through everything, and can be turned off under Settings then DF Articles
- New articles are noticed on their own, without searching for each video
  - Digital Foundry's recently published articles are checked periodically and attached to whatever video each is about, so the companion piece turns up on its own when it is written rather than only if you go looking
  - This is cheap in a way that searching per video is not. It reads each new article once instead of asking the site about every video you own, which works out at a handful of requests a day
  - On a new install it only considers the last week, so setting the app up does not kick off a long crawl. Going back through older content is the Backfill tool's job, where it tells you what that costs first
  - Turn it off, or change how often it looks and how much it reads at a time, under Settings then DF Articles
- An Articles section
  - Its own place in the sidebar, listing every Digital Foundry article the app knows about, newest first - each links out to the piece itself and to whichever of your videos it covers, and clicking one of those opens that video
  - Videos you have downloaded are marked, so it doubles as a way to see which written companions you have the video for
  - This is what the app has come across rather than everything Digital Foundry have published: the pieces it read while checking for new ones, plus any it weighed up while looking for a video's companion article. The page says so rather than implying it is the full archive
  - Costs nothing to browse - it reads what was already stored while matching articles to videos, so opening it never asks Digital Foundry for anything
- A new Analysis section, reading across everything you have analysed
  - Platform comparisons: every analysed console face-off side by side, with Digital Foundry's own recommendation quoted against each
  - Filter it to the platforms you care about - the rows and the columns both narrow, so picking two consoles gives you those two beside each other instead of hiding among eight
  - Games: what was covered per game, grouping the several videos DF often publish about one release, each opening its full analysis
  - Nothing here is averaged, scored or ranked. There is no best-platform column because the figure that would be needed for one - what a mode actually ran at, as opposed to what it aims for - is stated in only about a tenth of cases, and is missing most often when platforms performed about the same
- Backfill: apply subtitles, analysis or article matching to content you already have
  - Found under Tools. Pick any set of items and run one of the three actions across all of them at once
  - "Select all that need it" picks out everything still missing whatever you chose - the items with no subtitles, or no analysis, or no article found yet - so catching up on a back catalogue is one click rather than a scroll through the library
  - Manual selection works alongside it, with a filter box, so you can pick a handful instead
  - Each row says what it already has, so it is clear why something was or was not picked
- One background job, not hundreds
  - A run appears on the Activity page as a single job with overall progress, and can be paused or cancelled there like anything else
  - Work already finished when you cancel is kept - stopping a long article search does not throw away the matches it already found
  - Items are processed at a sensible rate rather than all at once: transcribing still runs one at a time so it does not take over the machine, and requests to Digital Foundry stay spaced out
- Options to redo work that is already done, off by default
  - Re-transcribe, re-analyse or search again for items that already have the thing - useful after changing your Whisper model, or once Digital Foundry have published an article that did not exist when you last looked
  - The confirmation says plainly what redoing means for that action, including that re-analysing is charged for again
- Costs shown before you commit to them
  - Analysing a set of videos shows an estimated total first, worked out from real pricing of a few of the items you actually picked rather than a generic figure
  - Article matching shows how many requests it will make to Digital Foundry and roughly how long that takes, since it is deliberately slow - a whole-library run is measured in hours
- Watch a downloaded video in the app
  - Press the still at the top of a downloaded video's panel and it opens in a player, with its subtitles and a list of what is in the video beside it - so checking what was actually said, or jumping to the one section you care about, no longer means finding the file on disk
  - One player, opened when you ask for it. The panel shows a still rather than a second video quietly loading behind whatever you are reading
  - Theater mode gives the video nearly the whole window with that list in a column beside it, for actually watching something rather than glancing at it
  - It remembers where you got to in each video for as long as the app is open, so closing the player and coming back does not start you at the beginning again. A different video still starts at its own beginning
  - Full screen, seeking, volume, playback speed and the captions menu are the browser's own, so they behave the way they do on any other site rather than being reinvented here
  - Play also sits with the rest of a file's actions on the Files tab, which is how you pick a particular file when a video was downloaded in more than one format
  - A downloaded video leads over the YouTube version of the same thing, and a small control switches back to YouTube, or between downloads when you have several
  - The browser's own Cast option, in the video's overflow menu, is switched off. It hands your TV a link it is not allowed to open, so it only ever got as far as putting a logo on the screen - cast these files from your media server instead, which also converts anything your TV cannot decode
  - Only the part of the file being watched is sent, so a multi-gigabyte video starts almost immediately and seeking anywhere in it is instant. This matters more than it sounds - without it, playing a four-gigabyte Direct would mean transferring all four gigabytes before the first frame appeared
  - Nothing is fetched until you press play
- One list of what is in a video, in the order it happens
  - The chapters written into the file and the moments the analysis found are shown together in time order, rather than as two separate lists to read side by side
  - Chapters read as headings, with the findings that fall inside them indented underneath, so the shape of the video is still there to see
  - Whichever row you are inside is highlighted and keeps up as the video plays, so the list also tells you where you are
  - Clicking any row jumps the video there
  - Chapters are read out of the file each time you open it, so chapters refreshed since the download are the ones you see
- Subtitles in the player
  - The .srt kept alongside a video is offered in the player's own captions menu, converted on the way out since browsers cannot read .srt directly
  - Subtitles embedded into the video instead cannot be shown - no browser can read subtitles back out of a video file. Rather than simply having no captions, the player explains why, and generating them again with the separate-.srt output is the way to get them
- An honest answer when a file will not play
  - Instead of a black rectangle you are told this machine has no decoder for the video, along with where the file is, so you can open it in a real player or through your media server
  - The check asks your browser what it can actually decode rather than assuming from the format, so an HEVC download is not refused on a machine that plays it perfectly well
### Enhancements
- Backfill runs show up on the Activity page, and say what they did
  - A run appears while it is going, with progress and a stop button, instead of disappearing until it finished
  - Clicking it shows the breakdown: how many were done, how many already had the thing, how many could never take it, and anything that failed. A run of 300 producing 4 results is unremarkable if 296 already had it, and a real problem if they were skipped for want of a transcript - so those are counted separately
  - Finished runs join the Completed list with everything else, and are cleared by the same Clear all
- The backfill list is easier to work through
  - A "needs work only" switch hides everything already done, which is most of the list once you have been through it once
  - "Select page" adds just the page you are looking at, alongside the existing buttons that select the whole filtered set - selection still adds up across pages
  - On a phone each row now stacks instead of scrolling sideways, so the title, date and status are all visible at once
- Subtitles can now be written both ways at once
  - The output setting gains a both option, alongside auto, embed and sidecar: it writes the subtitles into the video and keeps the .srt next to it
  - Previously this was a choice. Embedded subtitles travel with the file to a media server, while the separate .srt is the one the in-app player can read - wanting both meant generating twice
- A run checks each item again as it reaches it, rather than trusting the list from when it started. Over a few hundred items that gap matters: something can gain subtitles from an unrelated action while it waits its turn, and it now gets skipped rather than redone
- The content panel is organised into tabs
  - Files, Analysis, Article, and Activity while something is running. Opening a video you have not downloaded now shows the formats you can fetch, instead of four headings each telling you there is nothing there yet
  - Every tab says what is behind it - a count of files, a dot when an analysis or article exists, a pulsing one while work is in progress - so nothing is hidden without a trace
  - What you can download and what you already have sit together now, since they answer the same question
  - The panel stays one size as you move between tabs rather than resizing to fit each one, which on a phone used to move the tabs out from under your thumb
  - Side by side, the video and its description stay in view and each half scrolls on its own, so a long description no longer drags the formats and analysis down the page with it
- Swipe between pages on a touch screen
  - Moves through the content panel's tabs, and through the pages of Tools, Analysis and Settings
  - Ignores a swipe that is mostly vertical, and one that starts on something which scrolls sideways itself, so scrolling a wide settings table still scrolls the table
- Jump from an analysis to the moment it is talking about
  - Findings now carry the time they were said. A per-platform result, a settings row or a topic from a discussion show is one click from that point in the video
  - The time is found rather than guessed. The analysis quotes the video word for word, and the app locates that quote in the subtitles - so a jump either lands where the thing was actually said, or is not offered at all
  - A finding it cannot place shows no jump button rather than an approximate one. A timestamp that is 90 seconds out looks exactly as confident as a correct one, which makes it worse than none
  - Jumping from the analysis brings the video back into view first, so it works whether the two are side by side or on separate tabs
  - Only applies to analyses run from now on - existing ones keep working, they just have nothing to jump to until re-analysed
  - Playing a file on its own shows the same list beside the video, or under it on a narrower screen, in time order rather than grouped by kind - what happens next, rather than what sort of thing it is
- A log you can actually read
  - The app now writes its log to a file, and there is a Logs page under System to read it back - so working out what happened during a download no longer means having the container's console open at the time
  - Filter by level or search the text, and follow it live while something is running
  - Choose which levels reach the file, or turn file logging off entirely, under Settings then Logging
  - The file is capped and rotates, so it cannot quietly fill the disk on a long-running install
- Picking items in the Backfill list stays responsive with a few thousand of them, and the list is paged rather than cut short - the selection and the select-all buttons still apply across every page
### Bug Fixes
- Backfill says up front when it cannot run
  - Choosing AI analysis without an API key, or subtitles with no transcription service set up, now says so before you pick anything, and the Run button stays out of reach until it is sorted
  - It used to let you choose a target, select a thousand items and press Run before mentioning it, and the cost estimate quietly failed on the way so the confirmation showed no figure either
- Starting one kind of backfill no longer stalls behind another
  - Backfills of different kinds shared a single slot, so starting a subtitles run while articles were being matched put it in a queue behind hours of work and it looked like nothing had happened
  - They use different things - matching articles waits on Digital Foundry, transcribing uses your processor, analysing calls the AI - so they now run alongside each other. Two runs of the same kind still queue, which is the case that genuinely competes
- Thumbnails are sharp again everywhere they are shown large
  - Every thumbnail was being fetched at 300 pixels wide and then stretched to fit, so anywhere one was shown big - the top of a video's panel, the still behind the player before you press play - it was soft and blocky
  - The app had been asking for a larger image all along; the request was being quietly discarded because it was written for the address format Digital Foundry's old site used, and every thumbnail now comes from the new one
  - Thumbnails are also requested at the resolution your screen actually has, so they are crisp on a phone or a high-resolution monitor rather than only on an ordinary one
- Fixed pop-up panels never reaching the edges of a phone screen
  - A band of the page showed down both sides of every dialog, which reads as a misaligned window rather than as deliberate spacing
  - The rule meant to make dialogs full width on a phone had been silently overridden since it was written, so this had never once worked
- The check for new content now starts when the app does
  - The recurring check for newly published Digital Foundry videos was only set going once everything else the app does at startup had finished - filling in details missing from YouTube, scanning your download folder for files you already have. On a large library that is hours, and until it finished nothing new was noticed
  - An install left running could therefore sit there not picking up new videos, and appear to start working properly only because it had been restarted
  - The periodic checks are now started straight away. They still wait for the scan of the archive itself, which is the one thing they genuinely need in place first, but no longer for the slow work that follows it
### Security
- Updated a bundled library that had a reported flaw in how it writes a generated identifier into a buffer. Nothing here ever called it that way, so this was not exploitable in practice - it is updated so the app does not ship a known-vulnerable version at all
- Reading a file's embedded metadata now only works for files this app actually downloaded. It previously trusted the filename it was handed, so a signed-in user could have pointed it at any file on the machine and read its details back. The app itself only ever sent a real download, so nothing changes about how it is used
### Known Issues
- Analysis needs something to read
  - With no transcript and no matching article, only tags can be produced - there is nothing to summarise from. Generating subtitles for a video and analysing it again gives the full result
  - The analysis records what it had to work from, so items analysed thinly are identifiable rather than silently worse
- A plain game review is not yet recognised as its own kind of content, so it is analysed but does not appear under its game in the Analysis section. Face-offs, PC reviews, previews and Q+A shows all are
- Article matching across a large library is slow by design. Requests to Digital Foundry are deliberately spaced out, so a few thousand items is hours of queued work - it is safe to leave running, and safe to cancel
- Subtitles and analysis can only be applied to content you have downloaded, since both need the video file

## 2.7.1 (2026-08-29)

A small fix-up release: the content list's page controls could become completely unreachable once your library passed 100 items, made worse on a phone by a related sizing bug that cut off whatever sat at the bottom of the screen.

### Bug Fixes
- Fixed the content list's page controls being unreachable once you had more than 100 results
  - They sat after the full list of items on the page, with no way to reach them without scrolling past everything first - on a long list that read as 'there's no way to see more,' not 'it's further down'
  - Pinned them to the bottom of the screen instead, the same way the search bar is pinned to the top
- Fixed a sizing bug that could cut off content at the bottom of the screen on a phone
  - The app sized its main view assuming the browser's own address bar was fully out of the way, which it usually isn't right after opening a page - so on a real phone the app could believe it had more room than was actually visible
  - Whatever sat at that cut-off edge simply vanished rather than being reachable by scrolling, including the phone navigation bar in some cases and, combined with the issue above, the page controls entirely
  - This didn't show up in a resized desktop browser window, only on an actual phone, since desktop browsers don't have this address-bar behaviour to begin with

## 2.7.0 (2026-08-27)

Subtitles can now be generated locally on your own machine instead of being pulled from YouTube, which stopped serving them.

The interface has also had a substantial overhaul: a sidebar that collapses to icons, an Activity page that shows each job's pipeline as a segmented, filling track instead of a single spinner, a two-column content detail view, and a full pass on fonts, spacing and colour so it reads as considered software rather than a stock template. It's properly usable on a phone or tablet now too, and pop-up messages finally match whichever theme you've picked.

This release also fixes a long-standing gap where newly published videos could go unnoticed entirely, corrects chapter timings on videos with a sponsor segment, and does a good deal less work on your disks along the way. The interface now updates the moment something changes rather than asking the server for everything once a second, so progress appears immediately and an app with nothing running sits completely quiet.

### Features
- Local subtitle generation (Whisper)
  - Transcribes the downloaded file on this machine - no API key, no per-video cost, and nothing that can stop working because a third party changed their mind
  - Because it transcribes the actual file, the timings always line up with it exactly
  - Choose your own model to trade speed against accuracy - the smallest is fast but misses names, the larger ones match or beat YouTube's own captions
  - Set how many CPU threads it may use, so transcribing doesn't slow down everything else on the machine (defaults to leaving two cores free)
  - Correct words the transcriber consistently mishears - useful for jargon like 'UE5', which every option tested gets wrong
  - Models download automatically the first time you use one
  - Only one runs at a time by default, since transcribing uses most of your CPU for as long as it takes - configurable if you use a paid service where the work happens elsewhere
- Choose when subtitles are generated
  - Never - only when you ask for them on a specific item. Useful when only some content is worth subtitling
  - During the download, as before - the download isn't finished until subtitles are
  - After the download - the video is available to watch straight away and subtitles follow, which matters when generating them locally can take the better part of an hour
- Choose how subtitles are attached to the video
  - Embedded in the video file, so they travel with it if you move it
  - As a separate .srt alongside it, which Plex and Jellyfin both read - instant, and doesn't rewrite a file your media server might be playing
  - Or automatically: embedded when generated during a download, separate when added to a file already in your library
- Downloads and their follow-up work now survive a restart
  - Previously nothing recorded that a download had happened until everything after it finished too, so restarting during subtitle generation threw the download away and started over
  - The step a pipeline reached is remembered, so it picks up from there instead of re-downloading. The step that was actually running restarts, but everything before it is kept
  - If the downloaded file has since gone missing, it starts over rather than continuing with a file that isn't there
- Fixed a job's steps being described differently depending on where you looked
  - The steps a job had yet to reach were listed as 'skipped' in its details window while the card correctly showed them as still to come. The two views worked it out separately; they now share one answer
  - Steps that were never going to run for your settings - writing a separate subtitle file when subtitles are being embedded, for instance - are marked 'not needed' with the reason, rather than appearing as work still to come. They are listed in the details window and left out of the card, and if one runs anyway it appears regardless
  - The bar for each step is now sized by how much of the job it represents rather than every step getting an equal share. Transcribing is usually the longest part of a download, and now looks like it
- Fixed the time remaining on a paused download being nonsense
  - A paused download reported about 641286 hours remaining - roughly 73 years - because the estimate was still dividing by a made-up transfer rate after the real one had dropped to zero
  - No estimate is shown at all now unless something is actually running, and the underlying calculation says it does not know rather than inventing a number
- A job now shows both how long it has been going and how long it has actually been working
  - The single duration kept counting while a download was paused, which is right for one question and wrong for the other
  - Paused jobs show both, so 'Elapsed 6m 29s, Active 2m 14s' tells you the pause is why it is taking a while
- Stop and pause now work on queued jobs, whatever kind of work they are
  - Stop did nothing at all on a subtitles job. The button was greyed out, and pressing it would not have helped: it asked the job itself to stop, which means nothing to something that has not started yet
  - Anything sitting in the queue can now be stopped, whatever it is - it is simply taken out of the queue. Whether a job can be stopped once it is actually running is a separate question, and the button says so honestly: transcribing cannot be interrupted part-way, so it stays unavailable there rather than pretending
  - Queued jobs can also be held where they are, which previously was not offered at all - the only thing you could do to a queued job was push it to the front. Holding one lets the rest of the queue carry on past it, so putting off a long transcription no longer means stopping everything behind it
  - A held job says it is paused and offers to resume, so putting one back is the same gesture as any other pause
- A Stop all button on the Activity page, for abandoning a queue rather than cancelling it a job at a time. It warns first, and says how many can actually be stopped now against how many are already running and will have to finish
- Fixed several things a job could do without telling you anything
  - A paused download kept its progress bar - pausing at 60% used to empty the bar completely, which looked like the transfer had been thrown away
  - A queued, paused or waiting job now says so in words. It could previously show a title, an empty bar and two buttons with no explanation anywhere - which mattered most for exactly the case the app pauses deliberately, when it is spacing out its requests to Digital Foundry
  - A step that cannot report a percentage - most of the steps after the download - now shows moving activity rather than an empty bar indistinguishable from one that has not started
  - Pause, resume and cancel no longer open the job's details window as well as doing what you asked
  - Finished jobs can be cleared individually again, not only all at once
  - After a restart, the history of finished jobs shows which steps were skipped rather than marking them all as never reached
- The content list is usable from the keyboard again - rows can be tabbed to and opened with Enter or Space, as they could before the list was rebuilt
- Every job and content state is now told apart by its outline pattern as well as its icon and colour, so the two never rely on colour alone. Measured across the themes, colour by itself was separating some states by as little as one shade of grey
- Fixed the app icon showing as a blank page in the released build - the file was never actually served, so this has never worked in a real installation. The first attempt at this broke the app entirely on a real install, by serving the main script before the server had filled in the address of its own API; both are fixed together
- The list and grid buttons are now available on a phone. Switching to grid on a phone previously left no way back
- Changing how many downloads run at once now responds to every click, and saves once when you have finished rather than on each press
- The Activity page is now a rack rather than a stack of cards
  - Each job shows its pipeline as a row of segments, one per step, with the step that is actually running filling up as it goes - so you can see how far through a step is, not just which step it is on
  - Underneath, the numbers that matter - progress, rate, transferred, time remaining - in a fixed-width typeface so they stop jittering as they change
  - A job that failed now keeps its whole track, so you can see which step died and which never ran. Previously a failure collapsed to a single error icon at the end
  - Finished jobs collapse to one line each. Twenty completed downloads used to bury the two still running
  - Every step state has its own icon and its own fill as well as its own colour, so the track stays readable whichever theme you use
  - How many downloads run at once is now a plus/minus control in the toolbar rather than a dropdown of ten numbers
- The content details window is now two columns
  - The video and its description on the left, everything you can act on - what is on disk, what can still be fetched, what is running - on the right and always in view
  - Previously it was one long column, so on a video with a lengthy description the download options were off the bottom of the screen
- Settings now have a save bar that follows you down the page
  - It shows how many fields you have changed, and adds a Discard button to put them back
  - The Save button used to sit at the very bottom of a long page, so you had to scroll to the end just to find out whether you had changed anything
  - A section with unsaved changes is marked in the settings list, so leaving one behind is visible rather than silent
- The add-download button no longer appears on Settings and Tools pages, where it did nothing useful and sat on top of the save bar
- Click a task to see the full details of its run
  - Every step it went through, when each started and how long it took, so you can see where the time actually went
  - Steps that were skipped are shown as skipped rather than left blank
  - Failures show which step failed and why, instead of just a status line
  - A step that is still running shows its progress and how much longer it is likely to need, rather than only how long it has been going
  - Clicking the title opens the video's own details, so you can get from a task to the content it is for without going and finding it
- Long-running steps now show a progress bar rather than just a spinner
  - Subtitle generation reports how far through it is - previously a two-hour episode could spend half an hour with no sign anything was happening
  - Embedding metadata does the same while it rewrites the file
  - An estimated time remaining is shown alongside, so a long transcription tells you how much longer it needs and not just how far along it is - downloads already did this, everything else now does too
- The content list has been rebuilt for an archive of thousands
  - Two to three times as many videos fit on screen - about seven at the default size and eleven set to compact, against four before. The old layout gave each one a large thumbnail and most of a row of empty space, for a library of over three thousand items
  - Each row now carries what you actually scan for on one line - date, format, size and how many files - in a fixed-width typeface so the columns line up down the page instead of wandering
  - A coloured strip down the left edge of each row tells you its state at a glance, without reading anything
  - State is never signalled by colour alone. Every state also has its own icon and its own edge pattern - solid, dashed, dotted or none - so it stays readable whichever theme you use, and if you cannot easily tell colours apart
  - A downloading item shows its progress along the row's own bottom edge, so it does not grow taller and shove everything below it down the page as it starts
  - Choose comfortable or compact rows, or switch to a thumbnail grid. Your choice is remembered
- Filters you have applied are now visible
  - Running an advanced search used to close the dialog and leave no sign anything had been filtered - the only clue was that the Clear button had stopped being greyed out
  - Each active filter now appears as a chip under the search box, and can be removed on its own rather than forcing you to clear everything and start again
- Moving through pages is quicker
  - Page numbers replace the Previous/Next buttons that took up a whole bar at the bottom of the screen - going from page 1 to page 28 was 27 clicks
  - The sidebar shows how many videos are in the library and how many jobs are running
- Choose how the app looks
  - Three themes to pick from under Settings > Appearance: Signal, the dark teal look the app now ships with; Foundry, a warmer dark amber; and Paper, a proper light theme for anyone who does not want a dark interface
  - The choice applies the moment you pick it, so you can see what you are choosing rather than having to save first
  - It is remembered in the browser you chose it in, and saving also stores it against the installation - so a phone or a second machine that has never picked one follows whatever you set, while a browser you have themed yourself keeps its own choice
  - The page is painted in your theme before the app finishes loading, so there is no flash of the wrong colours on the way in
- New 'Scan now' button to check for newly published videos immediately, rather than waiting for the next scheduled check
- The request queue indicator now lists what is actually queued and what each request is doing, instead of only showing counts
- Opening a video's details no longer asks Digital Foundry about it every single time
  - The details window refreshed a video's information on every open, and each of those requests waits its turn behind a deliberate gap - so browsing the library felt like everything was being held up, and it put one request on Digital Foundry per item you looked at
  - Information confirmed against the live site within the last six hours is now reused instead. Anything older, anything never confirmed since the site move, and the check made immediately before a download still ask properly
  - The queue indicator now also shows requests that have just finished, and whether they succeeded. Quick requests used to vanish before they could be seen, which made the queue look like it only ever delays things
### Enhancements
- The interface has had its foundations reworked, and now looks like a considered piece of software rather than a default one
  - The app finally ships the typefaces it was designed with. It had been asking for fonts that were never included, so on most machines everything fell back to plain Helvetica or Arial - text is now noticeably clearer and more consistent, and it looks the same on every machine because nothing is downloaded from elsewhere
  - Panels are now separated by fine lines rather than by being progressively lighter. A card inside a dialog inside a page used to come out as three competing shades of grey, which made dense screens harder to read than they needed to be
  - Headings, buttons, labels and input fields have all been resized and restyled for a screen with a lot on it, instead of using the stock sizes the underlying toolkit ships with - a heading was previously set at six times the body size and had to be overridden everywhere it was used
  - Leftover styling from the project template the app was first created from has been removed. It had been quietly fighting the app's own theme, giving buttons and links a look that belonged to nothing in particular
  - Greyed-out text - 'No downloaded content yet', 'No download tasks' and the like - now uses the theme's own muted colour rather than a flat grey picked at random, so it stays legible and consistent
  - The browser tab now shows the Digital Foundry mark instead of the placeholder logo it had been shipping with
- The sidebar and title bar have been reworked around what you actually need to see
  - The sidebar collapses to a narrow strip of icons, or back again, freeing about 158px of width for the content itself. Press [ to toggle it, and it stays how you left it
  - It now carries five destinations and nothing else. Settings, Tools and System used to unfold into nested lists inside the sidebar; each section now shows its own pages in a column on the page itself, which is a much better fit for a list as long as Settings
  - The bar along the top tells you where you are instead of repeating the app name. It also used to lose the name entirely on a narrow window, leaving just a menu button
  - The bottom of the sidebar now shows the version and whether the app is signed in to Digital Foundry - including the brief period at startup while it is still checking, which previously showed nothing at all. Clicking the status takes you straight to the Digital Foundry settings, since nothing can download while it is out
  - Clicking the version opens the release notes. Previously they appeared once after an upgrade and could never be opened again
- On a phone the five sections now sit in a bar along the bottom, so getting between them is one tap rather than opening a menu first. The button for adding a download sits above that bar instead of covering the last item in the list
- Pop-up messages have been brought in line with the rest of the interface
  - They no longer appear in the bottom-left corner, where they landed on top of the button for adding a download and, on a phone, the bar along the bottom. They now sit under the title bar in the top right, which is the one edge of the screen with nothing else on it
  - They follow whichever theme you have chosen. They were the last part of the app left out of the theming work, so on the light theme they still arrived as a dark bar
  - A failure now stays on screen until you dismiss it. Everything cleared itself after five seconds, so a download that failed while you were away from the machine left no sign that anything had gone wrong
  - Confirmations of something you just did clear a little faster, and the 'Dismiss' button that used to appear on every message is gone - anything that clears itself can simply be clicked away, and the ones that stay have a close control instead
  - Each kind of message has its own icon as well as its own colour, so what one is telling you never depends on being able to tell colours apart
- The bottom of the sidebar no longer says the same thing twice
  - Whether the app is signed in to Digital Foundry was shown both as a dot on your avatar and as a labelled dot just below it. The dot on the avatar now only appears when the sidebar is collapsed, which is the one time the label is not there to say it
  - Dev mode was announced twice as well - once next to your username and again by replacing your avatar with a code icon. It now appears once, next to the version, which is where it belongs: it describes the build rather than you
  - Your avatar is your initial rather than a generic silhouette, which at that size told you nothing
- The Digital Foundry mark now opens and closes the sidebar, replacing the separate menu button
  - It is the thing people reach for, and it is a far bigger target than a small icon tucked at the bottom of the sidebar - which mattered on a touchscreen, where the collapsed sidebar's icon labels only appear on hover and so never appear at all
  - It also means the mark is now visible on a phone, where it previously only existed inside the menu once you had opened it
- Foldables and tablets now get the full layout instead of the phone one
  - The switch to the phone layout happened at 900px wide, which caught an unfolded foldable at 833px - a screen wider than plenty of laptops was being given a layout designed for a phone. It now switches at 720px
  - Between 720px and 900px the sidebar shows as icons only, which leaves the extra width for the content rather than the menu
  - Fold the device and it switches back to the phone layout on its own
  - A tablet held in portrait benefits from the same change
- Fixed the Reorganize Files table never collapsing to a single column on a narrow screen - the rule that was meant to do it could never match
- Thumbnails are now requested at the size they are actually shown at, rather than always at full width - a phone was downloading images roughly five times larger than it displayed them. They also load only as you scroll to them
- 'Downloads' in the sidebar is now called 'Activity'. The page lists scheduled items, running jobs, post-processing and completed runs, most of which are not downloads - and 'Downloads' already meant something different as a settings section. Existing links still work
- Finished files are written directly to their destination rather than being assembled elsewhere and copied across
  - Embedding metadata rewrites the whole file, so doing that somewhere else and then copying the result meant reading and writing a multi-gigabyte file twice over. This halves it
  - The same applies to files already in your library - refreshing metadata or adding subtitles no longer copies them back and forth
  - Replacing an existing file is now instantaneous rather than a slow overwrite, so a media server playing that file won't see it rewritten underneath
  - Downloads still go to the working directory first, so a partially downloaded file never appears in your library
  - Can be turned off with the 'Write Direct To Destination' setting if it doesn't suit your storage
- Embedding metadata and moving files now happen one at a time rather than up to five - they're limited by disk speed, so running several just makes them contend
- Fetching chapter information no longer fires several requests at once
- Subtitle actions now say 'generate' rather than 'fetch'. Every remaining option transcribes the downloaded file's audio rather than downloading captions from somewhere, so 'fetch' no longer described what happens
- Whisper can now be told whether to use a GPU. The build bundled in the Docker image is CPU-only, so this applies if you've pointed Whisper at your own GPU-enabled build - and it's worth being able to turn off, since the GPU on this kind of machine is often already busy transcoding for a media server
- The interface now updates as things happen, rather than asking for everything once a second
  - Progress, status changes and finished downloads appear the instant they happen instead of up to a second later
  - When nothing is running, the app now makes no requests at all - previously it asked for the full task list every second around the clock, whether anything was happening or not
  - While a download is running it still refreshes once a second, because the transfer speed and byte count genuinely change that often - everything else is sent only when it actually changes
  - Having several tabs or browsers open no longer multiplies the work. The server builds each update once and sends the same one to everyone watching
  - The request queue indicator now reacts within a second rather than up to five, and goes quiet when the queue is idle
  - If the connection can't be held open - some networks and reverse proxies interfere with this kind of connection - it falls back to the old behaviour automatically, and quietly switches back once the connection works again
- The app no longer re-checks the oldest end of the Digital Foundry archive every time it starts
  - Once it has been all the way through the archive, it now remembers that and skips it on later starts
  - It previously re-requested the last few pages of a completed pass on every restart, which could never turn up anything - those pages hold the oldest content, and newly published videos are found by the separate check that looks at the newest end
  - This means a slightly faster startup, and fewer requests to Digital Foundry from every installation on every restart
  - Deleting db/archive-scan-checkpoint.json still forces a fresh pass through the whole archive if you need one
- The app now records where a transcript is, and can keep one for you
  - When subtitles are saved as a separate .srt, the app remembers where it put it, and the file is listed against the download in the content details
  - New 'keep transcript' option: also save the .srt next to the video even when the subtitles are being embedded in it. Embedding alone leaves nothing you can open, search or read on its own
  - Off by default - turning it on starts writing new files into a library you already have, so it is your call rather than ours
  - Existing downloads get their transcript found automatically the first time you open their details, but only if the file is really there. Nothing is guessed and recorded blind, because files move and filenames are yours to configure
- Settings now explain themselves
  - Every setting that had no explanation now has one - retry and connection behaviour under Downloads, the archive scan depth, the Pushbullet fields, the log level, and more besides
  - Where a setting is a trade-off rather than a preference, the text says what you are trading. Opening more connections per download is faster but harder on the server; a shorter gap between checks finds new videos sooner but asks more of Digital Foundry
  - Explanations that previously only existed as comments in the code, and were never shown to anyone, now appear next to the setting they describe
  - The Whisper GPU note has moved from a paragraph underneath the checkbox to the checkbox itself, so it reads as part of the setting rather than as a footnote
- The 'can't reach the service' screen now works out what is actually wrong instead of guessing
  - For a new installation with the wrong address configured, this screen is the only thing you ever see - so it now tries to be enough on its own, without sending you to the README
  - It used to say a CORS problem was likely no matter what had happened. A service that isn't running, a service that is running but refusing the page, a service that answered with an error, and something else entirely sitting on that port are four different faults with four different fixes, and they now each get their own explanation
  - It tells the two commonest ones apart by asking the address a second question the browser will actually answer, so 'nothing is listening there' and 'it is listening and rejecting you' are no longer the same message
  - The most frequent mistake - leaving PUBLIC_ADDRESS unset, so every browser is told to look for the service on its own machine - is now named outright, with the exact line to set, filled in with the address you are already using
  - It shows what it checked and what came back, so if it has guessed wrong you can still see the addresses involved and work it out yourself, and there is something worth pasting into a bug report
  - Where the browser genuinely cannot tell two causes apart it says so, rather than picking one and sounding certain
  - The configuration examples are still there, now correct for your setup and copyable in one click, but they sit below the diagnosis rather than being the first thing you read
  - A 'Retry now' button, instead of waiting out a thirty-second timer - and the timer itself now counts down properly rather than sticking at zero, and the page no longer blanks out and rebuilds itself on every attempt
### Bug Fixes
- Fixed being signed out of the app every time it restarts
  - The key used to sign your login was thrown away and made again on every start, so every browser that was signed in was quietly logged out - including on an unattended restart or an automatic image update
  - It is now kept with the rest of the installation's settings, so a restart leaves you signed in
  - If you want to sign every browser out deliberately, delete config/jwt-secret.yaml and restart
- Logging out now genuinely ends the session on the server, rather than only forgetting it in the browser
  - The list of ended sessions was never actually consulted, so a login that had been copied elsewhere stayed usable until it expired of its own accord
  - This mattered little when every restart ended every session anyway, but now that signing in survives a restart it needed to work properly
- Fixed a newly started job showing another video's details after a restart
  - Jobs are numbered from one each time the app starts, so the first job after a restart reused a number already held by one in the completed history, and the two were treated as the same job
  - The older run also vanished from the history, having been mistaken for a duplicate of the new one
  - Job numbers now include a marker for the run they belong to, so they can no longer collide across restarts
- Fixed subtitle generation failing instantly on some processors
  - The bundled Whisper was compiled for whatever machine happened to build the Docker image, so it used instructions that other processors don't have and was killed the moment it ran, with no error message to explain it
  - Because the published image is built by a shared pool of machines, which processors it would run on varied from release to release
  - It now ships a version for every processor generation and picks the right one for your machine when it starts, so it runs anywhere - including older low-power NAS chips
  - This is slightly faster too, since it can now use whatever your processor supports rather than a lowest common denominator
- Failures now say what actually went wrong
  - When subtitle generation or another external tool failed, the app reported whatever that tool happened to print last - usually its harmless startup banner rather than the error itself
  - A tool that died without printing anything at all replaced the failure with an unrelated internal error, hiding it completely
  - The exit code is now reported, and a tool killed by the system - most often for running out of memory - is named as such
  - The reason a subtitle generator failed now appears against the task itself, rather than only in the server log
- Fixed newly published videos never being found at all if the app hadn't run for a while
  - Anything published more than the auto-download age limit before the next check was invisible to the app permanently - the age limit was accidentally being used to decide how far back to look, as well as what to download
  - One test install had missed ten videos across twelve days, including some only hours old
  - The app now also checks for new content immediately on startup and when you sign in, rather than waiting for the next scheduled check
- Fixed chapter timings being wrong on videos with a sponsor segment
  - Digital Foundry's downloads have the sponsor read cut out, but chapters come from YouTube, where it's still present - so every chapter after it was out by up to a minute and a half
  - Video length is now measured from the downloaded file itself rather than taken from YouTube, which is what makes the correction possible
- Fixed being unable to set up manual-only subtitles
  - Turning off automatic generation also hid the service configuration, so you could never choose which service a manual request should use - and if you'd never set one up, manual generation reported that none were configured with no way to fix it
- Fixed a failed metadata embed leaving the downloaded file stranded
  - The whole download was abandoned in the working directory and never appeared in your library, despite having downloaded successfully
  - It's now filed as normal, just without the embedded metadata, and the failure is logged
- Sponsor messages in descriptions are moved to the end so a video's description starts with what the video is actually about. Nothing is deleted
- Fixed descriptions displaying as one unbroken block of text, both in the web UI and in the downloaded files' own metadata (so also in Plex, Jellyfin and similar)
- Fixed subtitle files being read as a single subtitle containing the entire file, which affected refreshing metadata on already-downloaded content
- Fixed video titles containing a slash creating stray folders
  - A title like 'Resonance: A Plague Tale Legacy - PS5/PS5 Pro/Series X/S Tech Review' was filed three folders deeper than it should have been, scattered under directories that shouldn't exist
  - Other awkward characters in titles were already handled - only the slash slipped through, because it's also how you separate folders in your own filename template, so it couldn't simply be stripped out
  - Titles and the other details are now cleaned before your template is applied, so a slash in a title becomes an underscore while the ones you wrote in the template still create folders as intended
  - Anything already filed in the wrong place can be put right with Reorganize Files under Tools, followed by Remove Empty Directories to clear the leftovers
- Fixed Reorganize Files moving your files without recording where it moved them to
  - The files themselves were moved correctly, and the tool reported success - but the app carried on believing every one of them was still at its old location
  - That left it thinking files were missing when they weren't: they no longer appeared as downloaded, and refreshing metadata or generating subtitles on them had nothing to work on
  - This only affected content added since the move to the new Digital Foundry site - the tool was looking each file up by its title rather than by its actual identity, which happened to be the same thing for older entries carried over from the old site
  - If you have already run Reorganize Files and hit this, do not run it again - it would now try to move files from the old locations it still has recorded and, if you have 'remove record if missing' turned on, discard those records instead. Run Clear Missing Files under Tools followed by Scan For Existing Content, which finds the files where they actually are and reattaches them
  - Should this ever fail again, it now reports the affected files as failed rather than as moved
- Turning to the next page of the content list now takes you back to the top of it. Previously it left you wherever you had scrolled to, so you landed part-way down a page you hadn't seen the start of
- Fixed a database write scheduled right before shutdown being silently dropped
  - A change queued in the last moment before the app restarted or was updated - most often the very last step of a job completing - could be lost rather than saved, if it hadn't actually started running yet when shutdown began. Confirmed live against a real SIGINT
  - Shutdown now waits for that work to actually finish rather than only for whatever was already running
- The app now shows a plain error message and a reload button if something goes wrong, instead of a blank page
  - An error the interface didn't expect previously took the whole app down to a blank screen with nothing but a message in the browser console
### Maintenance
- Removed YouTube subtitle extraction. YouTube no longer serves captions to anything that isn't a web browser, so this had silently stopped working - an empty response is indistinguishable from 'this video has no captions', which is why it went unnoticed. Existing configurations are updated automatically on startup
### Known Issues
- If you had YouTube selected as your only subtitles service, subtitle generation will be switched off after upgrading until you enable Whisper (or Deepgram/Google STT) in Settings
- Whisper transcription is CPU-intensive and runs as part of the download, so a long video can hold up that download finishing on low-power hardware. Running it as a separate background task afterwards is planned
- Whisper has no GPU acceleration yet, so it can't make use of an integrated or discrete GPU

## 2.6.0 (2026-08-18)

Digital Foundry's new independent site is now fully supported - automatic scanning and downloading work end-to-end again for the first time since the old site was decommissioned. The Patreon HTML-paste workaround from 2.5.0 has been retired now that it's no longer needed.

### Features
- Automatic scanning and downloading against the new digitalfoundry.net are back
  - Detects new videos automatically on a relaxed timer, downloads your configured formats, and files them with metadata - the same automatic behavior the tool had before the old site was decommissioned
  - Auto-download is capped to recently-published content by default (configurable) so it can't accidentally mass-download a large backlog after being offline for a while
- Already-seen content is now rechecked for newly-added formats - catches cases where, e.g., an audio-only version is published before the video follows
### Bug Fixes
- Fixed downloads silently failing (stuck at 0%) due to a bug that could send the download request without the login cookie attached
### Security
- Fixed a critical dependency vulnerability (denial-of-service in a transitive package used for native module installation)
- Fixed a moderate open-redirect/XSS vulnerability in the routing library
### Maintenance
- Retired the Patreon HTML-paste import workaround now that real scraping works again - manual single-URL download is still available
- Removed tag-based content filtering, since the new site doesn't expose per-video tags the way the old one did - title-based filtering covers the same use cases in practice
- Updated the Docker image to the current Node.js LTS release
### Known Issues
- The new site doesn't expose per-video categories (e.g. DF Direct, DF Retro) in a way the tool can filter on yet

## 2.5.0 (2025-09-29)

Digital Foundry has transitioned to independence and their original website is being decommissioned. This version adapts the tool to work primarily with Patreon imports while the new DF site is under development. Many DF site-dependent features have been temporarily disabled but preserved for future reactivation.

### Features
- HTML Import System
  - Added HTML import functionality for extracting content from Patreon pages. Also has the ability to manually add downloads but it's frankly a bit rubbish
### Maintenance
- Disabled automatic DF site scanning to prevent hitting the decommissioned site
- Disabled 'Not logged in to digitalfoundry.net' dialog while preserving component for future use
- Preserved DF site integration code for reactivation when new site launches
### Known Issues
- Format detection relies on consistent HTML patterns from Patreon - changes to Patreon's layout may require updates
- Some legacy DF site features remain disabled until new site architecture is available
- Video properties inference is limited to common resolution and framerate patterns
- Some paths still attempt to scan digitalfoundry.net but these are pretty benign

## 2.4.0 (2025-03-13)

### Features
- Chapter info is now extracted from YouTube and injected into the downloaded content
- Ability to refresh downloaded content's metadata in the UI
  - e.g., if you've downloaded something and the metadata has changed, you can now re-fetch and re-inject it
  - This includes title, description etc. and chapter info
- Ability to edit content metadata in the UI
### Enhancements
- Skipped steps in pipelines now show as skipped in the UI (grey, tooltip text indicating skipped)
### Bug Fixes
- Throw error on empty response from YouTube track URL
- Auto select a subtitles service in fetch subtitles dialog

## 2.3.0 (2025-03-11)

### Features
- Added file templates in Content Management settings allowing you to specify custom naming based on info from the content.
  - Example: `{{#ifTag 'df direct'}}DF Direct/{{/ifTag}}{{YYYY}}/{{download-filename}}` - this will put all DF Directs into a DF Direct directory, and all content will go into YEAR/FILENAME
  - So `DF RETRO Analogue Pocket Review HEVC.mp4` would go to `2021\DF RETRO Analogue Pocket Review HEVC.mp4.mp4`
  - `DF Direct 199 1080p H264.mp4` would go to `DF Direct\2025\DF Direct 199 1080p H264.mp4a.mp4`
- Added various tools for file maintenance including
  - Reorganize files - a tool to allow you to reorganize your existing downloads based on the current configured template
  - Maintenance tools
    - Clear Missing Files - removes references to files that no longer exist (e.g., if you've downloaded something with the tool but since deleted it)
    - Scan for existing content - Scans directory for existing content and adds it to the DB
    - Clear empty directories - clears empty directories (useful if you've moved files around a lot from templates)
- Added changlog to the UI
  - Changelog is now available in the UI under the system menu
  - Changelog now displays in a dialog when a new version is detected
  - Will attempt to fetch the changelog from github first as this is the most up to date source and will help identify if the user is on the latest version
- Snackbars now display when tasks start and finish, and if the session token expires
### Bug Fixes
- Fixed drag and drop on mobile devices (media formats, subtitles providers)
### Enhancements
- Media format changes
  - Media formats now configured in its own config section
  - Audio encoding and video encoding properties are now parsed and form part of the media type matching
  - Improved media format matching based on the parsed encoding properties. This allows for improved matchers and better handling of different formats with different levels of specificity - This opens the door to the possibility of custom media formats in the future should it be needed, but right now they're hardcoded
  - Added various new media types - "Any" is a catch-all for any media type, "Video" is any video format, "Audio" is any audio format - "4K", "1440p", "1080p", "720p" are now separate media formats which don't care about the encoding - HEVC and h.264 are now catch-alls for any resolution, and HEVC, 4K etc at various resolutions have been added as media formats
  - It is now possible to add and remove items from the media format list in the UI
  - Any media formats NOT in the list are now ignored. This helps prevent automatic downloading of unwanted formats (such as RAR archives of UE5 projects)
- Automatically return to login page if session token expires
### Maintenance
- npm audit fix to address security vulnerabilities
### Internal
- Split the "database" into 3 separate files
  - content-info-db.json for content info (description, published date, tags, media infos etc)
  - content-status-db.json for local status of content (e.g. downloads, availability based on tiers etc)
  - user-db.json for info about the DF user
- changelog is now a .yaml file allowing programmatic access to the data
- Various schema changes
- Media info now includes both format (e.g. h.264) and type (e.g. VIDEO, AUDIO etc)

## 2.2.6 (2025-01-25)

### Bug Fixes
- Fix an issue on first run where container path was set to be relative to the services directory. This would result in downloads never actually being saved to the host machine. The working dir and destination dirs are now forced to /working_dir and /destination_dir when running in a container.

## 2.2.5 (2024-06-24)

### Bug Fixes
- Subtitles
  - Fixed bug where downloads would fail if subtitles could not be found (some content will not have subtitles at all, and regardless of this the download should still succeed)

## 2.2.4 (2024-06-20)

### Features
- YouTube video now embedded on content detail page if available
### Enhancements
- Tag Management
  - Always keep tags in order
- Content Metadata
  - Auto-refresh when opening content item
  - Refresh before download and when download is triggered (useful for delayed auto downloads as this could result in better match for desired format)
- Automatic Downloads
  - Automatic download is now skipped if the content is already downloading or downloaded (for example if you have download delay of 10 minutes but manually trigger the download before, it will now not perform a second unnecessary download)
- Subtitles
  - Use correct eng language code when injecting eng subs
- YouTube
  - Implemented a rudimentary method to detect and handle sponsored videos that contain additional content at the start. Since the downloaded videos from DF do not include this sponsored content, it could cause the subtitles to be significantly out of sync. Current is to offset the subtitles and remove the irrelevant ones if the YouTube video length exceeds our video length by more than 5 seconds (this works entirely on time difference and doesn't do anything fancy like try to understand the subs)
### Bug Fixes
- UI
  - Fixed console errors related to unique keys
  - Added keys to all routes
- Content management
  - Don't error if file no longer exists when trying to delete, instead just treat it as successfully deleted
### Known Issues
- Subtitles
  - Fetching subtitles on a video that already has them does not replace the subs. Currently the only option is to re-download the video.

## 2.2.3 (2024-04-27)

### Features
- Task Management
  - Added status message to subtitle tasks
  - Added pausing and cancelling task states to improve UI button states (e.g., can no longer try to pause/start a pausing task)
- Dependency Management
  - Removed unused dependencies

## 2.2.2 (2024-04-27)

### Features
- Documentation
  - Updated README and Docker run sample
- UI Improvements
  - Fixed archive page scanning after page structure change
  - Set max width on modal

## 2.2.1 (2024-04-20)

### Features
- Task Management
  - Introduced task manager, allowing pause, resume, cancel, force start
### Enhancements
- Download Improvements
  - Re-wrote download code to use fetch and custom FSM to allow better control of running downloads
  - Checks ETags when resuming
- UI Improvements
  - Improved some responsive styling
  - Fixed width on small screens
  - More active task info on cards
  - Improved layout of download status on small screen
  - Introduced UI components for download/post process/complete list
  - Improved icon size and fade
  - Added fun new loading icon
- Code Organization and Efficiency
  - Reorganized some code
  - General state efficiency improvements
  - Reorganized downloads
  - Improved df content redux state structure slightly
- Error Handling and Fixes
  - Added an error page when can't connect to backend
- Development and Build Improvements
  - Switched from create-react-app to vite
  - Switched to typescript 5.3.2
  - Updated Dockerfile to reduce layers and remove node_modules after builds (massively reduces image size)
  - Use node 20
- YouTube Subtitles
  - Added Youtube subtitles fetch code
### Bug Fixes
- Fixed bug with pushbullet, no longer notifies if disabled
- Fixed up notifications
### Miscellaneous
- Added dev settings
- Refactored db to account for multiple downloads
- Improved logging
- Removed console.logs

## 2.0.0-2.2.0 (2024-02-20)

### Features
- WebUI
  - There is now a web UI
- Subtitles
  - Added ability to extract subtitles from YouTube and use Google STT
### Enhancements
- Updated download button icons in detail view to reflect current status
- Updated media format matching to use RegEx
- Session Handling
- Improved handling when no session id set, media info rescanning etc
### Bug Fixes
- Downloader
  - Fixed bug where maxConnections not being honoured
- Fixed token config and allowed origins for localhost

## 1.0.0-1.x.x (2023-03-12)

The versioning for releases prior to 2.0 is patchy and may not accurately reflect the changes made in each version.

### Features
- Subtitles
  - Added experimental feature to auto generate subs using Deepgram
- Downloader
  - Added ability to run with multiple simultaneous connections
  - Can now scan full archive, scan for existing downloads, stores more meta, can be queried in REST API etc
  - Support for detecting paywalled content, checking user login status etc
### Bug Fixes
- Fixed description truncation by pulling from article body instead of meta
- Fixed bug where ignorelist wasn't being appended to correctly, resulting in duplicate downloads on restart
- Fixed CSS selectors when getting meta info about videos
