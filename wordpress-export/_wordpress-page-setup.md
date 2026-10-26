# IEEE SSCI 2027 WordPress Page Setup

Create parent pages first, then child pages. The page title is for WordPress administration and SEO; the slug plus parent controls the permalink used by the exported navigation.

## 1. Parent Pages

Table 1-1-1. Parent page setup.

| Title | Slug | Parent | Target URL | Note |
| --- | --- | --- | --- | --- |
| About | about | - | /about/ | Parent page for About child pages; content can be empty or a simple redirect. |
| Submissions | submissions | - | /submissions/ | Parent page for submission child pages; content can be empty or a simple redirect. |
| Program | program | - | /program/ | Parent page for program child pages; content can be empty or a simple redirect. |
| Sponsors | sponsors | - | /sponsors/ | Parent page for sponsor child pages; content can be empty or a simple redirect. |

## 2. Content Pages

Table 2-1-1. Content page setup.

| Title | Slug | Parent | Target URL | HTML file | Note |
| --- | --- | --- | --- | --- | --- |
| IEEE SSCI 2027 | home | - | / | full-pages/home.html | Set this published page as the static homepage in Settings > Reading. |
| Organizing Committee | organizing-committee | About | /about/organizing-committee/ | full-pages/about__organizing-committee.html |  |
| SSCI Evaluation and Planning Committee | evaluation-and-planning-committee | About | /about/evaluation-and-planning-committee/ | full-pages/about__evaluation-and-planning-committee.html |  |
| Contact Us | contact | About | /about/contact/ | full-pages/about__contact.html |  |
| Call For Papers and Other Submissions | call-for-papers | Submissions | /submissions/call-for-papers/ | full-pages/submissions__call-for-papers.html |  |
| Call for Tutorials | call-for-tutorials | Submissions | /submissions/call-for-tutorials/ | full-pages/submissions__call-for-tutorials.html |  |
| Submission Instructions | instructions | Submissions | /submissions/instructions/ | full-pages/submissions__instructions.html |  |
| Symposia Overview | symposia | - | /symposia/ | full-pages/symposia.html |  |
| 2027 IEEE Symposium on CI for Energy, Transport and Environmental Sustainability (IEEE CIETES) | energy-transport-environment | Symposia | /symposia/energy-transport-environment/ | full-pages/symposia__energy-transport-environment.html |  |
| 2027 IEEE Symposium on CI in Engineering / Cyber Physical Systems (IEEE CIES) | engineering-cyber-physical-systems | Symposia | /symposia/engineering-cyber-physical-systems/ | full-pages/symposia__engineering-cyber-physical-systems.html |  |
| 2027 IEEE Symposium on CI in Image, Signal Processing and Synthetic Media (IEEE CISM) | image-signal-synthetic-media | Symposia | /symposia/image-signal-synthetic-media/ | full-pages/symposia__image-signal-synthetic-media.html |  |
| 2027 IEEE Symposium on CI in Artificial Life and Cooperative Intelligent Systems (IEEE ALIFE-CIS) | artificial-life-cooperative-systems | Symposia | /symposia/artificial-life-cooperative-systems/ | full-pages/symposia__artificial-life-cooperative-systems.html |  |
| 2027 IEEE Symposium on CI in Security, Defence and Biometrics (IEEE CISDB) | security-defence-biometrics | Symposia | /symposia/security-defence-biometrics/ | full-pages/symposia__security-defence-biometrics.html |  |
| 2027 IEEE Symposium on CI in Health and Medicine (IEEE CIHM) | health-medicine | Symposia | /symposia/health-medicine/ | full-pages/symposia__health-medicine.html |  |
| 2027 IEEE Symposium on CI for Financial Engineering and Economics (IEEE CiFer) | financial-engineering-economics | Symposia | /symposia/financial-engineering-economics/ | full-pages/symposia__financial-engineering-economics.html |  |
| 2027 IEEE Symposium on CI in Natural Language Processing and Social Media (IEEE CI-NLPSoMe) | nlp-social-media | Symposia | /symposia/nlp-social-media/ | full-pages/symposia__nlp-social-media.html |  |
| 2027 IEEE Symposium on Trustworthy, Explainable and Responsible CI (IEEE CITREx) | trustworthy-explainable-responsible-ci | Symposia | /symposia/trustworthy-explainable-responsible-ci/ | full-pages/symposia__trustworthy-explainable-responsible-ci.html |  |
| 2027 IEEE Symposium for Multidisciplinary Computational Intelligence Incubators (IEEE MCII) | multidisciplinary-incubators | Symposia | /symposia/multidisciplinary-incubators/ | full-pages/symposia__multidisciplinary-incubators.html |  |
| Competitions | competitions | Program | /program/competitions/ | full-pages/program__competitions.html |  |
| Call for Sponsors | call-for-sponsors | Sponsors | /sponsors/call-for-sponsors/ | full-pages/sponsors__call-for-sponsors.html |  |
