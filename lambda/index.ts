import { APIGatewayProxyHandler, APIGatewayProxyEvent, APIGatewayProxyWebsocketEventV2, APIGatewayProxyResult, APIGatewayProxyResultV2 } from 'aws-lambda';
import { DynamoDB, ScanCommandInput, PutItemCommandInput, DeleteItemCommandInput, UpdateItemCommandInput } from '@aws-sdk/client-dynamodb';
import { HomeWSSendNotificationRequest } from '../models/HomeWSUpdateRequest';
import { HomeWSConnection } from '../models/HomeWSConnection';
import { HomeWSSendNotificationMessage, HomeWSSubscribeMessage } from '../models/HomeWSMessages';
import axios from 'axios';
const dynamo = new DynamoDB({});
const region = 'us-east-1';
const WSApiUrl = process.env.WS_API_URL + '/dev/@connections/';

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
					':subscriptionType': { S: body.subscriptionType }
				}
			};
			const queryResult = await dynamo.scan(params);
			const connections = queryResult.Items as unknown as HomeWSConnection[];

			connections.forEach(conn => {
				sendNotificationToConnection(conn, body);
			});
		}
	}
	
	const responseBody = 'testing';
	const statusCode = 200;
	const headers = {
		'Content-Type': 'application/json',
		'Access-Control-Allow-Origin' : '*'
	};

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
			const params: PutItemCommandInput = {
				TableName: 'HomeWSConnections',
				Item: {
					connectionId: { S: event.requestContext.connectionId },
					subscriptions: { SS: [] }
				}
			};
			try {
				res = await dynamo.putItem(params);
			} catch(e) {
				console.error('Error saving new connection to DynamoDB', e);
			}
			break;
		}
		case 'DISCONNECT': {
			// remove connection from db
			const params: DeleteItemCommandInput = {
				TableName: 'HomeWSConnections',
				Key: {
					connectionId: { S: event.requestContext.connectionId }
				}
			};
			try {
				res = await dynamo.deleteItem(params);
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
			const params: UpdateItemCommandInput = {
				TableName: 'HomeWSConnections',
				UpdateExpression: updateExpression,
				Key: {
					connectionId: { S: event.requestContext.connectionId }
				},
				ExpressionAttributeValues: {
					':subs': { 'SS': [body.subscriptionType] }
				}
			};
			try {
				res = await dynamo.updateItem(params);
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

async function sendNotificationToConnection(conn: HomeWSConnection, body: HomeWSSendNotificationRequest) {
	const requestBody: HomeWSSendNotificationMessage = { subscriptionType: body.subscriptionType, value: body.value };
	let res;
	try {
		res = await axios.post(WSApiUrl + conn.connectionId, requestBody);
		console.log(res);
	} catch(e) {
		console.error(`Error sending message to connection [${conn.connectionId}]`);
	}
	const responseBody = res ? res.data : '';
	const statusCode = res ? res.status : 500;
	const headers = {
		'Content-Type': 'application/json',
		'Access-Control-Allow-Origin' : '*'
	};
	
	return {
		statusCode,
		responseBody,
		headers,
	};
}