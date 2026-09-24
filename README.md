**SMRITI SAATHI**

*One Line Description*
A 3-version app that converts existing dementia therapies into gamified memory training and provides monitoring assistance to caregivers and medical observers especially designed to suit northeastern rural areas.

*Detailed Description*

The app has 3 user interfaces - Patient, Caregiver(Family), Medical observer. Which version to use will be determined at initial login page

1. Patient interface

- UI/UX
Available in north eastern languages
North-eastern visuals and sounds
Most of the patient features will be run through automations so the user doesn't have to care about lack of familiarity with technology
voice assisted features

- Games

i. Family and daily routine quiz
    based on reminscence therapy and the data will be input by caregiver(family)
ii. Find the object
    image will be shown and then find the object
iii. TBD word game (Dementia patinets struggle with language)
iv. 2 more games TBD

the score of games will be converted into trackable medical numbers used to make dashboard for caregiver and medical observer

the score of game will also be used to determine level of next game

- Reminders

reminders for water,medicine,calls, appointments etc for the patient set by patinet self or caregiver/medical observer
response is recorded after reminder to track
reminder response data will also be sent to caregiver/medical observer

- Background functions

music therapy based music library that will be played in background if panic is detected through user's voice
messages sent by family members recived and played(if voice/video messages)
daily review self note feature

- Family face chatbot

chatbot with avtar of family member's face 
guides with the app flow and answers basic questions

- Community feature

Patients are teamed up into communities by their monitoring and review by medical observer
In communities they can talk to other people, play game competitions etc

- Automations

online : through agentic ai and voice detections
the app can set reminders recommend games to play talk for comfort and play background features

offline : through ml & if-else structure
take into account locally stored data and perform the best suitable action , voice to text not available in offline mode so the app will ask manually for things

- offline architecture

the actions will be stored in local storage and queued to backend so that updates occur when internet restores

2. Caregiver interface

## Run the mobile prototype

The Expo / React Native app lives in `frontend/`.

1. Change to `frontend/` (`cd frontend`).
2. Install dependencies with `npm install`.
3. Start the development server with `npm start`.
4. Scan the QR code with Expo Go on your Android or iOS device. Keep the computer and phone on the same Wi-Fi network.

## Run the backend

The FastAPI backend setup and API workflow are documented in [backend/README.md](backend/README.md).

Choose Patient, Caregiver, or Medical Observer on the opening screen to see the matching landing page. The **Change role** control returns to the opening screen.

- making dashboard from data recieved from patient (the family dashboard won't be too medical heavy just enough to tell the patient's condition)

- an assist module to let them understand the patient better and treat them nicely

- weather api and real time life system for reminder for extreme weather and sundowning

- data input portal so that the ai will have content for playing background functions and chatbot memory the data will be stored either locally or encrypted for maintaining privacy

3. Medical observer interface

- making dashboard from patient's perfomance and usage data

- weather api and real time data

- community approval and community control (medical observers can also be a community mentors)

- direct messaging to patient and caregiver
