import { createAuthenticatedClient } from '@interledger/open-payments'
import {
  SecretsManagerClient,
  GetSecretValueCommand,
} from "@aws-sdk/client-secrets-manager";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { QueryCommand, DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";

export const paymentHandler = async (event: any) => {
  try {
    const userInfo = await getUserInfo(event.username);
    const keys = await getSecrets(userInfo.source);
    const client = await createAuthenticatedClient({
      walletAddressUrl: keys.walletAddressUrl,
      privateKey: keys.privateKey,
      keyId: keys.keyId
    });

    const receivingWalletAddressURL = event.walletAddress;

    const receivingWalletAddress = await client.walletAddress.get({
      url: receivingWalletAddressURL
    });

    const incomingPaymentGrant = await client.grant.request(
      {
        url: receivingWalletAddress.authServer,
      },
      {
        access_token: {
          access: [
            {
              type: "incoming-payment",
              actions: ["read", "complete", "create"],
            },
          ],
        },
      }
    );

    const incomingPayment = await client.incomingPayment.create(
      {
        url: receivingWalletAddress.resourceServer,
        accessToken: incomingPaymentGrant.access_token.value,
      },
      {
        walletAddress: receivingWalletAddress.id,
        incomingAmount: {
          assetCode: receivingWalletAddress.assetCode,
          assetScale: receivingWalletAddress.assetScale,
          value: event.amount,
        },
      }
    );

    const quoteGrant = await client.grant.request(
      {
        url: userInfo.walletInfo.walletAddress.authServer,
      },
      {
        access_token: {
          access: [
            {
              type: "quote",
              actions: ["create", "read"],
            },
          ],
        },
      }
    );

    const quote = await client.quote.create(
      {
        url: userInfo.walletInfo.walletAddress.resourceServer,
        accessToken: quoteGrant.access_token.value,
      },
      {
        walletAddress: userInfo.walletInfo.walletAddress.id,
        receiver: incomingPayment.id,
        method: "ilp",
      }
    );

    const outgoingPaymentGrant = await client.grant.request(
      {
        url: userInfo.walletInfo.walletAddress.authServer,
      },
      {
        access_token: {
          access: [
            {
              type: "outgoing-payment",
              actions: ["read", "create"],
              limits: {
                debitAmount: {
                  assetCode: quote.debitAmount.assetCode,
                  assetScale: quote.debitAmount.assetScale,
                  value: quote.debitAmount.value,
                },
              },
              identifier: userInfo.walletInfo.walletAddress.id,
            },
          ],
        },
        interact: {
          start: ["redirect"],
        },
      }
    );

    console.log(outgoingPaymentGrant.interact.redirect);

  } catch (error) {
    console.log(error);
    throw error;
  }
}

const getSecrets = async (secretsName: string): Promise<any> => {
  const client = new SecretsManagerClient({
    region: "us-east-1",
  });

  let response;

  try {
    response = await client.send(
      new GetSecretValueCommand({
        SecretId: secretsName,
        VersionStage: "AWSCURRENT",
      })
    );
  } catch (error) {
    throw error;
  }

  return response.SecretString;
}

const getUserInfo = async (username: string) => {
  try {
    const client = new DynamoDBClient({ region: 'us-east-1' });
    const docClient = DynamoDBDocumentClient.from(client);

    const command = new QueryCommand({
      TableName: process.env.USERS_VIEW_TABLE,
      KeyConditionExpression: "#source = :source",
      Limit: 1,
      ScanIndexForward: false,
      ExpressionAttributeValues: {
        ":source": username,
      },
      ExpressionAttributeNames: {
        '#source': 'source'
      }
    });

    const response = await docClient.send(command);
    return response.Items[0] || null;
  } catch (error) {
    throw error;
  }
}
