const express = require("express");
const app = express();
const { authenticate } = require("@google-cloud/local-auth");
const { google } = require("googleapis");
const path = require("path");
const port = 4000;

const SCOPES = [
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/gmail.labels",
  "https://mail.google.com/",
];

const labelName = "Replied";

app.get("/", async (req, res) => {
  const auth = await authenticate({
    keyfilePath: path.join(__dirname, "credentials.json"),
    scopes: SCOPES,
  });

  async function getUnrepliedMessages(auth) {
    const gmail = google.gmail({ version: "v1", auth });
    const response = await gmail.users.messages.list({
      userId: "me",
      labelIds: ["INBOX"],
      q: "is:unread",
    });
    return response.data.messages || [];
  }

  async function createLabel(auth) {
    const gmail = google.gmail({ version: "v1", auth });
    try {
      const response = await gmail.users.labels.create({
        userId: "me",
        requestBody: {
          name: labelName,
          labelListVisibility: "labelShow",
          messageListVisibility: "show",
        },
      });
      return response.data.id;
    } catch (error) {
      if (error.code === 409) {
        const response = await gmail.users.labels.list({
          userId: "me",
        });
        const label = response.data.labels.find(
          (label) => label.name === labelName
        );
        return label.id;
      } else {
        throw error;
      }
    }
  }

  async function auto_reply() {
    const labelId = await createLabel(auth);

    setInterval(async () => {
      const mails = await getUnrepliedMessages(auth);
      if (mails && mails.length > 0) {
        const gmail = google.gmail({ version: "v1", auth });
        for (const mail of mails) {
          const maildata = await gmail.users.messages.get({
            userId: "me",
            id: mail.id,
          });

          const email = maildata.data;
          const replied = email.payload.headers.some(
            (header) => header.name === "In-Reply-To"
          );

          if (!replied) {
            const reply = {
              userId: "me",
              requestBody: {
                raw: Buffer.from(
                  `To: ${
                    email.payload.headers.find(
                      (header) => header.name === "From"
                    ).value || ""
                  }\r\n` +
                    `Subject: Re: ${
                      email.payload.headers.find(
                        (header) => header.name === "Subject"
                      )?.value || ""
                    }\r\n` +
                    `Content-Type: text/plain; charset="UTF-8"\r\n` +
                    `Content-Transfer-Encoding: 7bit\r\n\r\n` +
                    `THIS IS A AUTOMATED MAIL. PLEASE WAIT SOME TIME FOR RESPONSE.\r\n`
                ).toString("base64"),
              },
            };

            await gmail.users.messages.send(reply);

            await gmail.users.messages.modify({
              userId: "me",
              id:mail.id,
              requestBody: {
                addLabelIds: [labelId],
                removeLabelIds: ["INBOX"],
              },
            });
          }
        }
      }
    }, Math.floor(Math.random() * (120 - 45 + 1) + 45) * 1000);
  }

  // Call the main function to start the auto-reply process
  auto_reply();
});

app.listen(port, () => {
  console.log(`Server is running`);
});
