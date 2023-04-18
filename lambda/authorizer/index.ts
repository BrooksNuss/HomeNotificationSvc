import { APIGatewayAuthorizerResult, APIGatewayRequestAuthorizerEvent } from 'aws-lambda';
import { CognitoJwtVerifier } from 'aws-jwt-verify';

const userPoolId = process.env.USER_POOL_ID;
const clientId = process.env.USER_POOL_CLIENT_ID;

export const handler = async (event: APIGatewayRequestAuthorizerEvent): Promise<APIGatewayAuthorizerResult> => {
	console.log(event);
	// Get the Cognito token from the request headers
	// const token = event.requestContext.authorizer?.jwt.claims.token_use;
	const token = event.queryStringParameters?.token;
	console.log('auth token: ');
	console.log(token);

	if (!token) {
		console.error('missing token');
		return createResponse('Deny', event.methodArn);
	}
	if (!userPoolId || !clientId) {
		console.error('missing user pool id or client id');
		throw new Error('internal server error');
	}
	const verifier = CognitoJwtVerifier.create({
		userPoolId: userPoolId,
		tokenUse: 'id',
		clientId: clientId,
	});
	try {
		const response = await verifier.verify(token);
		console.log(response);
	} catch (err) {
		console.error('error verifying token');
		console.error(err);
		return createResponse('Deny', event.methodArn);
	}

	console.log('auth success');
	// Return a 200 OK response if the token is valid
	return createResponse('Allow', event.methodArn);
};

function createResponse(effect: 'Allow' | 'Deny', resource: string) {
	return {
		'principalId': 'user',
		'policyDocument': {
			'Version': '2012-10-17',
			'Statement': [
				{
					'Action': 'execute-api:Invoke',
					'Effect': effect,
					'Resource': resource
				}
			]
		}
	};
}