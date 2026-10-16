import { CognitoIdentityProviderClient, ListUsersCommand } from '@aws-sdk/client-cognito-identity-provider';
import { createAuthenticatedClient } from '@interledger/open-payments'
import {
  SecretsManagerClient,
  GetSecretValueCommand,
} from "@aws-sdk/client-secrets-manager";

const client = new CognitoIdentityProviderClient({ region: 'us-east-1' });

export const handler = async (event: any,) => {
  try {
    console.log(event?.request?.userAttributes);
    console.log(event?.request);

    const isWalletCreated = await isWalletRegistered(event?.request?.userAttributes['custom:walletId']);

    if (!event?.request?.userAttributes['custom:walletId'] && !isWalletCreated) {
      throw new Error('Invalid wallet address');
    }

    const isEmail = await isEmailRegistered(event?.request?.userAttributes?.email);
    const isPhone = await isPhoneNumberRegistered(event?.request?.userAttributes['phone_number']);

    if (isEmail) {
      throw new Error('Email already registered');
    }

    if (isPhone) {
      throw new Error('Phone number already registered');
    }

  } catch (error) {
    throw (error);
  }
};

const isWalletRegistered = async (walletId: string): Promise<boolean | undefined> => {
  try {
    const keys = await getSecrets('natillera/open-payments-client');
    const client = await createAuthenticatedClient({
      walletAddressUrl: keys.walletAddressUrl,
      privateKey: keys.privateKey,
      keyId: keys.keyId
    })

    const verifyWalletAddress = await client.walletAddress.get({
      url: `https://ilp.interledger-test.dev/${walletId}`,
    })
    if (verifyWalletAddress) return true
  } catch (error) {
    return false
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

const isEmailRegistered = async (email: string) => {
  // Parametros para la consulta de usuarios
  const params = {
    UserPoolId: process.env.USER_POOL_ID!,
    Filter: `email = "${email}"`,
    AttributesToGet: ['email'],
  };

  // Ejecutar el comando ListUsersCommand
  const command = new ListUsersCommand(params);
  const response = await client.send(command);

  // Verificar si la respuesta tiene usuarios registrados
  return response.Users && response.Users.length > 0;
};

const isPhoneNumberRegistered = async (phone_number: string) => {
  // Parametros para la consulta de usuarios
  const params = {
    UserPoolId: process.env.USER_POOL_ID,
    Filter: `phone_number = "${phone_number}"`,
    AttributesToGet: ['phone_number'],
  };

  // Ejecutar el comando ListUsersCommand
  const command = new ListUsersCommand(params);
  const response = await client.send(command);

  // Verificar si la respuesta tiene usuarios registrados
  return response.Users && response.Users.length > 0;
};
