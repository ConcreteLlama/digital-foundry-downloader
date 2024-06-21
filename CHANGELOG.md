# Changelog

## Version 2.2.4 (2024-06-18 to 2024-06-20)

### New Features

- YouTube video now embedded on content detail page if available

### Improvements

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

### Bug fixes

- UI
  - Fixed console errors related to unique keys
  - Added keys to all routes
- Content management
  - Don't error if file no longer exists when trying to delete, instead just treat it as successfully deleted

### Known issues

- Subtitles
  - Fetching subtitles on a video that already has them does not replace the subs. Currently the only option is to re-download the video.

## Version 2.2.3 (2024-04-27)

- Task Management
  - Added status message to subtitle tasks
  - Added pausing and cancelling task states to improve UI button states (e.g. can no longer try to pause/start a pausing task)
- Dependency Management
  - Removed unused dependencies

## Version 2.2.2 (2024-04-20 to 2024-04-27)

- Documentation
  - Updated README and Docker run sample
- UI Improvements
  - Fixed archive page scanning after page structure change
  - Set max width on modal

## Version 2.2.1 (2024-02-04 to 2024-04-20)

- Task Management
  - Introduced task manager, allowing pause, resume, cancel, force start
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
- Miscellaneous
  - Fixed bug with pushbullet, no longer notifies if disabled
  - Fixed up notifications
  - Added dev settings
  - Refactored db to account for multiple downloads
  - Improved logging
  - Removed console.logs

## Version 2.0.0-2.2.0 (2023-11-06 to 2024-02-20)

- WebUI
  - There is now a web UI
- Downloader
  - Fixed bug where maxConnections not being honoured
  - Added ability to extract subtitles from YouTube and use Google STT
  - Updated download button icons in detail view to reflect current status
  - Updated media format matching to use RegEx
- Session Handling
  - Improved handling when no session id set, media info rescanning etc
  - Fixed token config and allowed origins for localhost

## Version 1.0.0+ (2022-08-18 to 2023-03-12)

- Subtitles
  - Added experimental feature to auto generate subs using Deepgram
- Downloader
  - Added ability to run with multiple simultaneous connections
  - Can now scan full archive, scan for existing downloads, stores more meta, can be queried in REST API etc
  - Support for detecting paywalled content, checking user login status etc
- Bug Fixes
  - Fixed description truncation by pulling from article body instead of meta
  - Fixed bug where ignorelist wasn't being appended to correctly, resulting in duplicate downloads on restart
  - Fixed CSS selectors when getting meta info about videos

## Pre-2.2 Versioning

The versioning for releases prior to 2.2 is patchy and may not accurately reflect the changes made in each version.
