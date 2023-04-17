import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { CognitoJwtVerifier } from 'aws-jwt-verify';

const userPoolId = process.env.USER_POOL_ID;
const clientId = process.env.USER_POOL_CLIENT_ID;

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
	console.log(event);
	// Get the Cognito token from the request headers
	// const token = event.requestContext.authorizer?.jwt.claims.token_use;
	const token = event.queryStringParameters?.token;
	console.log('auth token: ');
	console.log(token);

	if (!token) {
		console.log('missing token');
		return { statusCode: 400, body: 'Missing auth token' };
	}
	if (!userPoolId || !clientId) {
		console.log('missing user pool id or client id');
		throw new Error('internal server error');
	}
	const verifier = CognitoJwtVerifier.create({
		userPoolId: userPoolId,
		tokenUse: 'id',
		clientId: clientId,
	});
	verifier.verify(token);

	console.log('auth success');
	// Return a 200 OK response if the token is valid
	return { statusCode: 200, body: 'results' };
};
