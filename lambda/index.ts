import { APIGatewayProxyHandler, APIGatewayProxyEvent, APIGatewayProxyWebsocketEventV2, APIGatewayProxyResult } from 'aws-lambda';
import { DynamoDB } from '@aws-sdk/client-dynamodb';
import { DeleteCommandInput, DynamoDBDocument, PutCommandInput, ScanCommandInput, UpdateCommandInput } from '@aws-sdk/lib-dynamodb';
import { HomeWSSendNotificationRequest } from '../models/HomeWSUpdateRequest';
import { HomeWSConnection } from '../models/HomeWSConnection';
import { HomeWSSendNotificationMessage, HomeWSSubscribeMessage } from '../models/HomeWSMessages';
import {
	ApiGatewayManagementApiClient,
	PostToConnectionCommand,
	PostToConnectionCommandOutput,
} from '@aws-sdk/client-apigatewaymanagementapi';

const dynamoClient = DynamoDBDocument.from(new DynamoDB({}));
const region = 'us-east-1';
const WSApiUrl = process.env.WS_API_URL;
const wsManagementClient = new ApiGatewayManagementApiClient({ endpoint: WSApiUrl });

export const handler: APIGatewayProxyHandler = async (event, context) => {
	console.log('Received event:', JSON.stringify(event, null, 2));
	// console.log('Event type: ', event.requestContext.eventType);

	let res;
	if (event.requestContext.httpMethod) {
		res = await handleHttpEvent(event);
	} else {
		res = await handleWebsocketEvent(event as APIGatewayProxyWebsocketEventV2);
	}

	return res;
};

async function handleHttpEvent(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
	let results: Array<any> = [];
	if (event.resource === '/sendnotification') {
		// get all connections that have a recipient type matching the one in the body
		const body = JSON.parse(event.body || '') as HomeWSSendNotificationRequest;
		if (body) {
			// get dynamo items
			const params: ScanCommandInput = {
				TableName: 'HomeWSConnections',
				FilterExpression: 'contains(#subscriptions, :subscriptionType)',
				ExpressionAttributeNames: {
					'#subscriptions': 'subscriptions'
				},
				ExpressionAttributeValues: {
					':subscriptionType': body.subscriptionType
				}
			};
			const queryResult = await dynamoClient.scan(params);
			console.log('query result');
			console.log(queryResult.Items);
			const connections = queryResult.Items as unknown as HomeWSConnection[];

			console.log('connections');
			console.log(JSON.stringify(connections));
			const requests: Array<Promise<any>> = [];
			connections.forEach(async (conn) => {
				console.log(conn.connectionId);
				console.log(conn.subscriptions);
				requests.push(sendNotificationToConnection(conn, body));
			});

			results = await Promise.allSettled(requests);
			console.log('results:');
			console.log(results);
		}
	}
	
	const responseBody = 'sent a message to connections: ' + JSON.stringify(results);
	const statusCode = 200;
	const headers = {
		'Content-Type': 'application/json',
		'Access-Control-Allow-Origin' : '*'
	};

	console.log('sending final result of handler');

	return {
		statusCode,
		body: responseBody,
		headers
	};
}

async function handleWebsocketEvent(event: APIGatewayProxyWebsocketEventV2): Promise<APIGatewayProxyResult> {
	let res;
	switch (event.requestContext.eventType) {
		case 'CONNECT': {
			// save connection to db
			const params: PutCommandInput = {
				TableName: 'HomeWSConnections',
				Item: {
					connectionId: event.requestContext.connectionId,
					subscriptions: new Set<string>(['allUsers'])
				}
			};
			try {
				res = await dynamoClient.put(params);
			} catch(e) {
				console.error('Error saving new connection to DynamoDB', e);
			}
			break;
		}
		case 'DISCONNECT': {
			// remove connection from db
			const params: DeleteCommandInput = {
				TableName: 'HomeWSConnections',
				Key: {
					connectionId: event.requestContext.connectionId
				}
			};
			try {
				res = await dynamoClient.delete(params);
			} catch(e) {
				console.error('Error deleting connection from DynamoDB', e);
			}
			break;
		}
		case 'MESSAGE': {
			// based on message type, sub to listener, remove listener
			if (!event.body) {
				console.warn('Received client websocket message with empty body', event);
				break;
			}
			const body: HomeWSSubscribeMessage = JSON.parse(event.body);
			const updateExpression = body.value === 'subscribe' ? 'add subscriptions :subs' : 'delete subscriptions :subs';
			const params: UpdateCommandInput = {
				TableName: 'HomeWSConnections',
				UpdateExpression: updateExpression,
				Key: {
					connectionId: event.requestContext.connectionId
				},
				ExpressionAttributeValues: {
					':subs': new Set([body.subscriptionType])
				}
			};

			try {
				res = await dynamoClient.update(params);
			} catch(e) {
				console.error('Error updating subscriptions', event);
				console.error(e);
			}
			break;
		}
	}

	const body = 'testing';
	const statusCode = 200;
	const headers = {
		'Content-Type': 'application/json',
		'Access-Control-Allow-Origin' : '*'
	};

	return {
		statusCode,
		body,
		headers
	};
}

function sendNotificationToConnection(conn: HomeWSConnection, body: HomeWSSendNotificationRequest): Promise<PostToConnectionCommandOutput> {
	console.log('sending notifications to connections');
	const requestBody: HomeWSSendNotificationMessage = { subscriptionType: body.subscriptionType, value: body.value };
	console.log('request body');
	console.log(requestBody);
	const wsUrl = WSApiUrl + conn.connectionId;
	console.log('websocket connections url', wsUrl);
	const command = new PostToConnectionCommand({
		ConnectionId: conn.connectionId,
		Data: Uint8Array.from(JSON.stringify(requestBody) as any)
	});
	let res;
	try {
		console.log('posting notification');
		res = wsManagementClient.send(command);
		console.log('notification sent');
		console.log(res);
	} catch(e) {
		console.error(`Error sending message to connection [${conn.connectionId}]`);
	}

	if (res) {
		return res;
	}
	return new Promise(() => { return true; });
}